import Database from 'better-sqlite3';
import { getDatabase, closeDatabase } from '../config/database';
import { logger } from '../config/logger';
import { mapStatusToDisplay } from '../types';

interface CSVRow {
  [key: string]: string;
}

/**
 * Escape CSV value (handles quotes, commas, newlines)
 */
function escapeCSV(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Convert array of objects to CSV string
 */
function arrayToCSV(rows: CSVRow[], headers: string[]): string {
  const csvRows: string[] = [];
  
  // Header row
  csvRows.push(headers.map(escapeCSV).join(','));
  
  // Data rows
  for (const row of rows) {
    csvRows.push(headers.map(header => escapeCSV(row[header] || '')).join(','));
  }
  
  return csvRows.join('\n');
}

/**
 * Export trends with their signals as CSV
 */
export function exportTrendsWithSignals(projectId: string): string {
  const db = getDatabase(projectId);
  
  try {
    const trends = db.prepare(`
      SELECT 
        t.id as trend_id,
        t.summary as trend_summary,
        t.status as trend_status,
        t.signal_count,
        t.created_at as trend_created,
        s.id as signal_id,
        s.original_text as signal_text,
        s.title as signal_title,
        s.source as signal_source,
        s.note as signal_note,
        s.status as signal_status,
        s.created_at as signal_created
      FROM trends t
      LEFT JOIN signals s ON s.trend_id = t.id
      ORDER BY t.created_at DESC, s.created_at ASC
    `).all() as Array<{
      trend_id: string;
      trend_summary: string;
      trend_status: string;
      signal_count: number;
      trend_created: string;
      signal_id: string | null;
      signal_text: string | null;
      signal_title: string | null;
      signal_source: string | null;
      signal_note: string | null;
      signal_status: string | null;
      signal_created: string | null;
    }>;
    
    const rows: CSVRow[] = trends.map(t => ({
      'Trend ID': t.trend_id,
      'Trend Summary': t.trend_summary,
      'Trend Status': t.trend_status,
      'Signal Count': t.signal_count.toString(),
      'Trend Created': t.trend_created,
      'Signal ID': t.signal_id || '',
      'Signal Title': t.signal_title || '',
      'Signal Description': t.signal_text || '',
      'Signal Source': t.signal_source || '',
      'Signal Status': t.signal_status ? mapStatusToDisplay(t.signal_status as 'unassigned' | 'assigned' | 'retired') : '',
      'Signal Note': t.signal_note || '',
      'Signal Created': t.signal_created || ''
    }));
    
    const headers = [
      'Trend ID', 'Trend Summary', 'Trend Status', 'Signal Count', 'Trend Created',
      'Signal ID', 'Signal Title', 'Signal Description', 'Signal Source', 'Signal Status', 'Signal Note', 'Signal Created'
    ];
    
    return arrayToCSV(rows, headers);
  } finally {
    closeDatabase(projectId);
  }
}

/**
 * Export all signals as CSV
 */
export function exportSignals(projectId: string): string {
  const db = getDatabase(projectId);
  
  try {
    const signals = db.prepare(`
      SELECT 
        s.id,
        s.original_text,
        s.title,
        s.source,
        s.note,
        s.status,
        s.trend_id,
        t.summary as trend_summary,
        s.created_at,
        s.updated_at
      FROM signals s
      LEFT JOIN trends t ON s.trend_id = t.id
      ORDER BY s.created_at ASC
    `).all() as Array<{
      id: string;
      original_text: string;
      title: string | null;
      source: string | null;
      note: string | null;
      status: string;
      trend_id: string | null;
      trend_summary: string | null;
      created_at: string;
      updated_at: string;
    }>;
    
    const rows: CSVRow[] = signals.map(s => ({
      'Signal ID': s.id,
      'Signal Title': s.title || '',
      'Signal Description': s.original_text,
      'Signal Source': s.source || '',
      'Signal Status': mapStatusToDisplay(s.status as 'unassigned' | 'assigned' | 'retired'),
      'Signal Note': s.note || '',
      'Trend ID': s.trend_id || '',
      'Trend Summary': s.trend_summary || '',
      'Created': s.created_at,
      'Updated': s.updated_at
    }));
    
    const headers = ['Signal ID', 'Signal Title', 'Signal Description', 'Signal Source', 'Signal Status', 'Signal Note', 'Trend ID', 'Trend Summary', 'Created', 'Updated'];
    
    return arrayToCSV(rows, headers);
  } finally {
    closeDatabase(projectId);
  }
}

/**
 * Export trend summaries only as CSV
 */
export function exportTrendSummaries(projectId: string): string {
  const db = getDatabase(projectId);
  
  try {
    const trends = db.prepare(`
      SELECT 
        id,
        summary,
        signal_count,
        status,
        created_at,
        updated_at
      FROM trends
      ORDER BY created_at DESC
    `).all() as Array<{
      id: string;
      summary: string;
      signal_count: number;
      status: string;
      created_at: string;
      updated_at: string;
    }>;
    
    const rows: CSVRow[] = trends.map(t => ({
      'Trend ID': t.id,
      'Summary': t.summary,
      'Signal Count': t.signal_count.toString(),
      'Status': t.status,
      'Created': t.created_at,
      'Updated': t.updated_at
    }));
    
    const headers = ['Trend ID', 'Summary', 'Signal Count', 'Status', 'Created', 'Updated'];
    
    return arrayToCSV(rows, headers);
  } finally {
    closeDatabase(projectId);
  }
}

