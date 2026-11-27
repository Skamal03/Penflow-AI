import sampleFindings from './sample-report.json';
import type { ScanReport } from '../lib/reportTypes';

/**
 * Mock data for the engine Report page until the backend serves report.json.
 * Produced by `python main.py --dry-run --no-ai` -> core/reports/<run_id>/report.json.
 */
export const sampleReport = sampleFindings as unknown as ScanReport;
