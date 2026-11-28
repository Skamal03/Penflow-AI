import { randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { verifyServiceToken } from '../auth/service-token.js';
import { one, query, transaction } from '../db/index.js';

const router = express.Router();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.use((req: Request, res: Response, next: NextFunction) => {
  const status = verifyServiceToken(req.get('authorization'));
  if (status === 'unconfigured') {
    res.status(503).json({ error: 'Engine service authentication is not configured.' });
    return;
  }
  if (status !== 'valid') {
    res.status(401).json({ error: 'Engine service authentication failed.' });
    return;
  }
  next();
});

router.get('/runs/:id/scope-policy', async (req, res, next) => {
  try {
    const runId = typeof req.params.id === 'string' ? req.params.id : '';
    if (!uuidPattern.test(runId)) { res.sendStatus(404); return; }
    const row = await one<{
      run_id: string;
      run_status: string;
      policy_id: string | null;
      target_id: string | null;
      owner_id: string;
      roe_status: string | null;
      automated_decision: string | null;
      scope_token: string | null;
      lab_mode: boolean | null;
      target_url: string | null;
      target_status: string | null;
      policy_status: string | null;
      policy_json: Record<string, unknown> | null;
      policy_hash: string | null;
      expires_at: Date | null;
    }>(
      `SELECT r.id AS run_id, r.status AS run_status, r.policy_id, r.target_id, r.owner_id,
              roe.status AS roe_status, roe.automated_decision, roe.scope_token, roe.lab_mode,
              target.url AS target_url, target.status AS target_status,
              policy.status AS policy_status, policy.policy_json, policy.policy_hash, policy.expires_at
       FROM runs r
       LEFT JOIN roe_documents roe ON roe.id = r.roe_id AND roe.owner_id = r.owner_id
       LEFT JOIN targets target ON target.id = r.target_id AND target.owner_id = r.owner_id
       LEFT JOIN scope_policies policy ON policy.id = r.policy_id AND policy.roe_id = r.roe_id
         AND policy.user_id = r.owner_id AND policy.target_id = r.target_id
       WHERE r.id = $1`,
      [runId],
    );
    if (!row) { res.sendStatus(404); return; }
    if (row.run_status !== 'running' || !row.policy_id || !row.target_id
      || row.roe_status !== 'approved' || !row.scope_token
      || !['valid', 'passed'].includes(row.automated_decision ?? '')
      || row.target_status !== 'verified'
      || row.policy_status !== 'active' || !row.policy_json || !row.policy_hash
      || !row.expires_at || row.expires_at.getTime() <= Date.now()
      || row.policy_json.policy_hash !== row.policy_hash) {
      res.status(409).json({ error: 'The run does not have a valid active scope policy.' });
      return;
    }
    const target = row.policy_json.target;
    const window = row.policy_json.time_window;
    if (!target || typeof target !== 'object' || Array.isArray(target)
      || (target as Record<string, unknown>).url !== row.target_url
      || (target as Record<string, unknown>).lab_mode !== row.lab_mode
      || !window || typeof window !== 'object' || Array.isArray(window)) {
      res.status(409).json({ error: 'The stored scope policy no longer matches its verified target.' });
      return;
    }
    const policyWindow = window as Record<string, unknown>;
    const start = Date.parse(typeof policyWindow.start === 'string' ? policyWindow.start : '');
    const end = Date.parse(typeof policyWindow.end === 'string' ? policyWindow.end : '');
    if (!Number.isFinite(start) || !Number.isFinite(end) || Date.now() < start || Date.now() >= end) {
      res.status(409).json({ error: 'The scope policy authorization window is inactive.' });
      return;
    }
    const enabledTools = (await query<{ tool: string }>(
      'SELECT tool FROM scope_tool_settings WHERE enabled = TRUE ORDER BY tool',
    )).map((item) => item.tool);
    res.set('Cache-Control', 'no-store');
    res.json({
      run_id: row.run_id,
      run_status: row.run_status,
      policy_id: row.policy_id,
      target_id: row.target_id,
      target_url: row.target_url,
      target_status: row.target_status,
      lab_mode: row.lab_mode,
      policy_json: row.policy_json,
      policy_hash: row.policy_hash,
      expires_at: row.expires_at.toISOString(),
      enabled_tools: enabledTools,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/runs/:id/scope-audit', async (req, res, next) => {
  try {
    const runId = typeof req.params.id === 'string' ? req.params.id : '';
    const { policyId, tool, args, decision, reason, stopRun } = req.body ?? {};
    if (!uuidPattern.test(runId)
      || !(policyId === null || typeof policyId === 'string' && uuidPattern.test(policyId))
      || typeof tool !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(tool)
      || !args || typeof args !== 'object' || Array.isArray(args)
      || typeof decision !== 'string' || !['allowed', 'blocked'].includes(decision)
      || typeof reason !== 'string' || !reason.trim() || reason.length > 500
      || typeof stopRun !== 'boolean'
      || decision === 'allowed' && (policyId === null || stopRun)) {
      res.status(400).json({ error: 'Scope audit fields are invalid.' });
      return;
    }
    if (Buffer.byteLength(JSON.stringify(args), 'utf8') > 16_384) {
      res.status(400).json({ error: 'Scope audit arguments are too large.' });
      return;
    }
    const run = await one<{ id: string; owner_id: string; policy_id: string | null; status: string }>(
      'SELECT id, owner_id, policy_id, status FROM runs WHERE id = $1',
      [runId],
    );
    if (!run) { res.sendStatus(404); return; }
    if (policyId !== null && policyId !== run.policy_id) { res.sendStatus(404); return; }
    if (decision === 'allowed' && run.status !== 'running') {
      res.status(409).json({ error: 'Only a running, policy-bound run may record an allow decision.' });
      return;
    }
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO scope_audit_log (id, run_id, policy_id, user_id, tool, args_json, decision, reason)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [randomUUID(), run.id, policyId, run.owner_id, tool, JSON.stringify(args), decision, reason.trim()],
      );
      if (decision === 'blocked' && stopRun && run.status === 'running') {
        await client.query("UPDATE runs SET status = 'failed', finished_at = NOW() WHERE id = $1 AND owner_id = $2 AND status = 'running'", [run.id, run.owner_id]);
      }
    });
    res.status(201).json({ recorded: true, stopped: decision === 'blocked' && stopRun && run.status === 'running' });
  } catch (error) {
    next(error);
  }
});

const severityNames = ['Critical', 'High', 'Medium', 'Low', 'Informational'];
const severityScore: Record<string, number> = { Critical: 90, High: 70, Medium: 50, Low: 25, Informational: 5 };
const sevKey: Record<string, string> = { Critical: 'critical', High: 'high', Medium: 'medium', Low: 'low', Informational: 'info' };
const text = (value: unknown, max = 4000) => (typeof value === 'string' ? value.slice(0, max) : '');
const asDate = (value: unknown) => {
  const d = typeof value === 'string' ? new Date(value) : null;
  return d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

router.post('/runs/:id/results', async (req, res, next) => {
  try {
    const runId = typeof req.params.id === 'string' ? req.params.id : '';
    const { status, report, reportHtml } = req.body ?? {};
    if (!uuidPattern.test(runId) || !['completed', 'failed'].includes(status)
      || !report || typeof report !== 'object' || Array.isArray(report)
      || (reportHtml != null && (typeof reportHtml !== 'string' || reportHtml.length > 1_000_000))
      || JSON.stringify(report).length > 2_000_000) {
      res.status(400).json({ error: 'Run result fields are invalid.' });
      return;
    }
    const findings: Record<string, any>[] = Array.isArray(report.findings) ? report.findings : [];
    if (findings.length > 500) { res.status(400).json({ error: 'Too many findings.' }); return; }

    const run = await one<{ id: string; owner_id: string; roe_id: string; status: string }>(
      'SELECT id, owner_id, roe_id, status FROM runs WHERE id = $1', [runId]);
    if (!run) { res.sendStatus(404); return; }
    if (run.status !== 'running') { res.status(409).json({ error: 'Results can only be saved for a running run.' }); return; }

    const overall = severityNames.includes(report.overall?.severity) ? report.overall.severity : 'Informational';
    const stored = { ...report, run_id: run.id, owner: { user_id: run.owner_id, roe_id: run.roe_id } };

    await transaction(async (client) => {
      const claimed = await client.query(
        "UPDATE runs SET status = $2, finished_at = NOW() WHERE id = $1 AND owner_id = $3 AND status = 'running'",
        [run.id, status === 'completed' ? 'complete' : 'failed', run.owner_id]);
      if (claimed.rowCount !== 1) throw Object.assign(new Error('conflict'), { status: 409 });
      for (const f of findings) {
        const sev = severityNames.includes(f.severity) ? f.severity : 'Informational';
        const score = Number.isInteger(f.risk_score) ? Math.min(100, Math.max(0, f.risk_score)) : severityScore[sev];
        await client.query(
          `INSERT INTO findings (id, run_id, type, title, component, severity, risk_score, score_rationale,
                                 cve_id, actively_exploited, evidence, plain_language)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [randomUUID(), run.id, text(f.tool, 64) || 'unknown', text(f.name, 500) || 'Untitled finding',
            text(f.url, 1000), sevKey[sev], score, text(f.technical_note, 1000) || 'Scored from severity.',
           Array.isArray(f.cve) && typeof f.cve[0] === 'string' ? f.cve[0].slice(0, 64) : null,
           f.kev === true, text(f.evidence), text(f.summary)]);
      }
      await client.query(
        `INSERT INTO reports (id, owner_id, roe_id, run_id, target, overall_severity, counts, status,
                              report_json, report_html, started_at, finished_at, generated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11,NOW(),NOW())`,
        [randomUUID(), run.owner_id, run.roe_id, run.id, text(report.target, 1000), overall,
         JSON.stringify(report.counts && typeof report.counts === 'object' ? report.counts : {}),
         status, JSON.stringify(stored), reportHtml ?? null, asDate(report.started_at)]);
    });
    res.status(201).json({ saved: true, findings: findings.length });
  } catch (error) {
    if ((error as { status?: number }).status === 409) { res.status(409).json({ error: 'Run is no longer running.' }); return; }
    next(error);
  }
});

export default router;
