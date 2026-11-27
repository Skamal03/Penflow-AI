import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { one, transaction } from '../db/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const runIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const folderNamePattern = /^[A-Za-z0-9_-]+$/;
const severityMap: Record<string, string> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  info: 'info',
  informational: 'info',
};

type IngestedReport = { id: string; run_id: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`Report finding is missing a valid ${key}.`);
  return value;
}

function ensureInside(root: string, candidate: string): void {
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new Error('Report path must remain inside the reports directory.');
  }
}

function findingUuid(runId: string, findingId: string): string {
  const bytes = Buffer.from(createHash('sha256').update(`${runId}:${findingId}`).digest().subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function reportFiles(reportFolderName: string): Promise<{ json: string; markdown: string }> {
  const configuredDir = process.env.PENFLOW_REPORTS_DIR;
  const reportsDir = resolve(configuredDir || resolve(here, '../../core/reports'));
  const realReportsDir = await realpath(reportsDir);
  const reportDir = await realpath(resolve(realReportsDir, reportFolderName));
  ensureInside(realReportsDir, reportDir);

  const jsonPath = await realpath(resolve(reportDir, 'report.json'));
  const markdownPath = await realpath(resolve(reportDir, 'report.md'));
  ensureInside(realReportsDir, jsonPath);
  ensureInside(realReportsDir, markdownPath);

  const [json, markdown] = await Promise.all([
    readFile(jsonPath, 'utf8'),
    readFile(markdownPath, 'utf8'),
  ]);
  return { json, markdown };
}

export async function ingestReport(runId: string, reportFolderName: string): Promise<IngestedReport> {
  if (!runIdPattern.test(runId)) throw new TypeError('runId must be a UUID.');
  if (typeof reportFolderName !== 'string' || !folderNamePattern.test(reportFolderName)) {
    throw new TypeError('reportFolderName contains invalid characters.');
  }

  const existingRun = await one<{ id: string }>('SELECT id FROM runs WHERE id = $1', [runId]);
  if (!existingRun) throw new Error(`Run ${runId} was not found.`);

  const files = await reportFiles(reportFolderName);
  let parsedReport: unknown;
  try {
    parsedReport = JSON.parse(files.json);
  } catch (error) {
    throw new Error('report.json is not valid JSON.', { cause: error });
  }
  if (!isRecord(parsedReport)) throw new TypeError('report.json must contain a JSON object.');
  if (typeof parsedReport.generated_at !== 'string' || !Number.isFinite(Date.parse(parsedReport.generated_at))) {
    throw new TypeError('report.json is missing a valid generated_at timestamp.');
  }
  if (!Array.isArray(parsedReport.findings)) throw new TypeError('report.json must contain a findings array.');

  const findings = parsedReport.findings.map((value) => {
    if (!isRecord(value)) throw new TypeError('Each report finding must be a JSON object.');
    const id = stringField(value, 'id');
    const name = stringField(value, 'name');
    const tool = stringField(value, 'tool');
    const url = typeof value.url === 'string' ? value.url : '';
    const rawSeverity = typeof value.severity_key === 'string'
      ? value.severity_key.toLowerCase()
      : typeof value.severity === 'string' ? value.severity.toLowerCase() : '';
    const severity = severityMap[rawSeverity];
    if (!severity) throw new TypeError(`Report finding has unsupported severity: ${rawSeverity || '(missing)'}.`);

    const riskScore = value.risk_score;
    if (riskScore !== null && (typeof riskScore !== 'number' || !Number.isInteger(riskScore) || riskScore < 0 || riskScore > 100)) {
      throw new TypeError('Report finding risk_score must be null or an integer from 0 to 100.');
    }
    const cves = value.cve;
    if (cves !== undefined && (!Array.isArray(cves) || cves.some((cve) => typeof cve !== 'string'))) {
      throw new TypeError('Report finding cve must be an array of strings.');
    }
    if (value.kev !== undefined && value.kev !== null && typeof value.kev !== 'boolean') {
      throw new TypeError('Report finding kev must be a boolean or null.');
    }

    const summary = typeof value.summary === 'string' && value.summary.trim() ? value.summary : name;
    const technicalNote = typeof value.technical_note === 'string' ? value.technical_note : '';
    const scoreRationale = technicalNote || (riskScore === null
      ? 'No numeric risk score was supplied by the engine.'
      : 'The engine supplied a numeric risk score without a rationale.');

    return {
      id,
      databaseId: findingUuid(runId, id),
      name,
      tool,
      url,
      component: url || name,
      severity,
      riskScore,
      scoreRationale,
      cveId: Array.isArray(cves) ? cves.join(', ') || null : null,
      activelyExploited: value.kev === true,
      evidence: typeof value.evidence === 'string' ? value.evidence : '',
      plainLanguage: summary,
    };
  });

  const generatedAt = new Date(parsedReport.generated_at);
  return transaction(async (client) => {
    const run = await client.query<{ id: string; owner_id: string; roe_id: string }>(
      'SELECT id, owner_id, roe_id FROM runs WHERE id = $1 FOR UPDATE',
      [runId],
    );
    const dbRun = run.rows[0];
    if (!dbRun) throw new Error(`Run ${runId} was not found.`);

    const reportOwner = isRecord(parsedReport.owner) ? parsedReport.owner : {};
    const reportJson = {
      ...parsedReport,
      owner: { ...reportOwner, user_id: dbRun.owner_id, roe_id: dbRun.roe_id },
    };
    const storedReport = await client.query(
      `INSERT INTO reports (id, run_id, owner_id, markdown, generated_at, report_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (run_id) DO UPDATE SET
         owner_id = EXCLUDED.owner_id,
         markdown = EXCLUDED.markdown,
         generated_at = EXCLUDED.generated_at,
         report_json = EXCLUDED.report_json
       RETURNING id, run_id`,
      [randomUUID(), dbRun.id, dbRun.owner_id, files.markdown, generatedAt, JSON.stringify(reportJson)],
    );

    for (const finding of findings) {
      const alreadyExists = await client.query(
        'SELECT id FROM findings WHERE run_id = $1 AND type = $2 AND title = $3 AND component = $4 LIMIT 1',
        [dbRun.id, finding.tool, finding.name, finding.component],
      );
      if (alreadyExists.rowCount) continue;

      await client.query(
        `INSERT INTO findings
          (id, run_id, type, title, component, severity, risk_score, score_rationale, cve_id, actively_exploited, evidence, plain_language)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [
          finding.databaseId,
          dbRun.id,
          finding.tool,
          finding.name,
          finding.component,
          finding.severity,
          finding.riskScore,
          finding.scoreRationale,
          finding.cveId,
          finding.activelyExploited,
          finding.evidence,
          finding.plainLanguage,
        ],
      );
    }

    const savedReport = storedReport.rows[0];
    if (!savedReport || typeof savedReport.id !== 'string' || typeof savedReport.run_id !== 'string') {
      throw new Error('The report record was not returned after ingestion.');
    }
    return { id: savedReport.id, run_id: savedReport.run_id };
  });
}
