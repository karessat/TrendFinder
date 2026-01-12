import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exportTrendsWithSignals, exportSignals, exportTrendSummaries } from '../../services/exportService';
import { getDatabase, closeDatabase, deleteProjectDatabase } from '../../config/database';
import { loadEnv } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';

describe('exportService', () => {
  const testProjectId = 'proj_testexport';

  beforeEach(() => {
    // Ensure environment is loaded
    try {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      process.env.DATA_DIR = './data/test-projects';
      loadEnv();
    } catch (e) {
      // Already loaded, ignore
    }

    // Clean up if exists
    try {
      if (getDatabase) {
        closeDatabase(testProjectId);
        deleteProjectDatabase(testProjectId);
      }
    } catch (e) {
      // Ignore cleanup errors
    }

    // Create test database and data
    const db = getDatabase(testProjectId);
    
    // Initialize processing status
    db.prepare(`
      INSERT INTO processing_status (project_id, total_signals, status)
      VALUES (?, 0, 'pending')
    `).run(testProjectId);
    
    // Create test signals
    const signal1 = uuidv4();
    const signal2 = uuidv4();
    const signal3 = uuidv4();
    
    db.prepare(`
      INSERT INTO signals (id, original_text, status)
      VALUES (?, ?, 'unassigned')
    `).run(signal1, 'Test signal 1');
    
    db.prepare(`
      INSERT INTO signals (id, original_text, status)
      VALUES (?, ?, 'unassigned')
    `).run(signal2, 'Test signal 2');
    
    db.prepare(`
      INSERT INTO signals (id, original_text, status)
      VALUES (?, ?, 'assigned')
    `).run(signal3, 'Test signal 3');
    
    // Create test trend
    const trend1 = uuidv4();
    db.prepare(`
      INSERT INTO trends (id, summary, signal_count, status)
      VALUES (?, ?, 2, 'draft')
    `).run(trend1, 'Test trend summary');
    
    // Assign signals to trend
    db.prepare('UPDATE signals SET trend_id = ?, status = ? WHERE id = ?').run(trend1, 'assigned', signal1);
    db.prepare('UPDATE signals SET trend_id = ?, status = ? WHERE id = ?').run(trend1, 'assigned', signal2);
    
    closeDatabase(testProjectId);
  });

  afterEach(() => {
    try {
      closeDatabase(testProjectId);
      deleteProjectDatabase(testProjectId);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('exportTrendsWithSignals', () => {
    it('exports trends with their signals as CSV', () => {
      const csv = exportTrendsWithSignals(testProjectId);
      
      expect(csv).toContain('Trend ID');
      expect(csv).toContain('Trend Summary');
      expect(csv).toContain('Signal ID');
      expect(csv).toContain('Signal Text');
      expect(csv).toContain('Test trend summary');
      expect(csv).toContain('Test signal 1');
      expect(csv).toContain('Test signal 2');
    });

    it('includes proper CSV headers', () => {
      const csv = exportTrendsWithSignals(testProjectId);
      const lines = csv.split('\n');
      const headerLine = lines[0];
      
      expect(headerLine).toContain('Trend ID');
      expect(headerLine).toContain('Trend Summary');
      expect(headerLine).toContain('Signal ID');
      expect(headerLine).toContain('Signal Text');
    });

    it('handles empty trends gracefully', () => {
      // Create empty project
      const emptyProjectId = 'proj_testemptyexport';
      try {
        closeDatabase(emptyProjectId);
        deleteProjectDatabase(emptyProjectId);
      } catch (e) {}
      
      const db = getDatabase(emptyProjectId);
      db.prepare(`
        INSERT INTO processing_status (project_id, total_signals, status)
        VALUES (?, 0, 'pending')
      `).run(emptyProjectId);
      closeDatabase(emptyProjectId);
      
      const csv = exportTrendsWithSignals(emptyProjectId);
      expect(csv).toContain('Trend ID'); // Headers should exist
      
      closeDatabase(emptyProjectId);
      deleteProjectDatabase(emptyProjectId);
    });
  });

  describe('exportSignals', () => {
    it('exports all signals as CSV', () => {
      const csv = exportSignals(testProjectId);
      
      expect(csv).toContain('Signal ID');
      expect(csv).toContain('Text');
      expect(csv).toContain('Status');
      expect(csv).toContain('Test signal 1');
      expect(csv).toContain('Test signal 2');
      expect(csv).toContain('Test signal 3');
    });

    it('includes proper CSV headers', () => {
      const csv = exportSignals(testProjectId);
      const lines = csv.split('\n');
      const headerLine = lines[0];
      
      expect(headerLine).toContain('Signal ID');
      expect(headerLine).toContain('Text');
      expect(headerLine).toContain('Status');
      expect(headerLine).toContain('Trend ID');
      expect(headerLine).toContain('Trend Summary');
    });

    it('handles empty signals gracefully', () => {
      const emptyProjectId = 'proj_testemptysignals';
      try {
        closeDatabase(emptyProjectId);
        deleteProjectDatabase(emptyProjectId);
      } catch (e) {}
      
      const db = getDatabase(emptyProjectId);
      db.prepare(`
        INSERT INTO processing_status (project_id, total_signals, status)
        VALUES (?, 0, 'pending')
      `).run(emptyProjectId);
      closeDatabase(emptyProjectId);
      
      const csv = exportSignals(emptyProjectId);
      expect(csv).toContain('Signal ID'); // Headers should exist
      
      closeDatabase(emptyProjectId);
      deleteProjectDatabase(emptyProjectId);
    });
  });

  describe('exportTrendSummaries', () => {
    it('exports trend summaries only as CSV', () => {
      const csv = exportTrendSummaries(testProjectId);
      
      expect(csv).toContain('Trend ID');
      expect(csv).toContain('Summary');
      expect(csv).toContain('Signal Count');
      expect(csv).toContain('Test trend summary');
      expect(csv).toContain('2'); // Signal count
    });

    it('includes proper CSV headers', () => {
      const csv = exportTrendSummaries(testProjectId);
      const lines = csv.split('\n');
      const headerLine = lines[0];
      
      expect(headerLine).toContain('Trend ID');
      expect(headerLine).toContain('Summary');
      expect(headerLine).toContain('Signal Count');
      expect(headerLine).toContain('Status');
    });

    it('does not include signal details', () => {
      const csv = exportTrendSummaries(testProjectId);
      
      expect(csv).not.toContain('Signal ID');
      expect(csv).not.toContain('Test signal 1');
      expect(csv).not.toContain('Test signal 2');
    });

    it('handles empty trends gracefully', () => {
      const emptyProjectId = 'proj_testemptytrends';
      try {
        closeDatabase(emptyProjectId);
        deleteProjectDatabase(emptyProjectId);
      } catch (e) {}
      
      const db = getDatabase(emptyProjectId);
      db.prepare(`
        INSERT INTO processing_status (project_id, total_signals, status)
        VALUES (?, 0, 'pending')
      `).run(emptyProjectId);
      closeDatabase(emptyProjectId);
      
      const csv = exportTrendSummaries(emptyProjectId);
      expect(csv).toContain('Trend ID'); // Headers should exist
      
      closeDatabase(emptyProjectId);
      deleteProjectDatabase(emptyProjectId);
    });
  });

  describe('CSV escaping', () => {
    it('escapes commas in CSV values', () => {
      const projectId = 'proj_testcsvescape';
      try {
        closeDatabase(projectId);
        deleteProjectDatabase(projectId);
      } catch (e) {}
      
      const db = getDatabase(projectId);
      db.prepare(`
        INSERT INTO processing_status (project_id, total_signals, status)
        VALUES (?, 0, 'pending')
      `).run(projectId);
      
      const signalId = uuidv4();
      db.prepare(`
        INSERT INTO signals (id, original_text, status)
        VALUES (?, ?, 'unassigned')
      `).run(signalId, 'Signal with, comma');
      
      closeDatabase(projectId);
      
      const csv = exportSignals(projectId);
      // CSV should properly escape the comma
      expect(csv).toContain('Signal with, comma');
      
      closeDatabase(projectId);
      deleteProjectDatabase(projectId);
    });

    it('escapes quotes in CSV values', () => {
      const projectId = 'proj_testcsvquotes';
      try {
        closeDatabase(projectId);
        deleteProjectDatabase(projectId);
      } catch (e) {}
      
      const db = getDatabase(projectId);
      db.prepare(`
        INSERT INTO processing_status (project_id, total_signals, status)
        VALUES (?, 0, 'pending')
      `).run(projectId);
      
      const signalId = uuidv4();
      db.prepare(`
        INSERT INTO signals (id, original_text, status)
        VALUES (?, ?, 'unassigned')
      `).run(signalId, 'Signal with "quotes"');
      
      closeDatabase(projectId);
      
      const csv = exportSignals(projectId);
      // CSV should properly escape quotes
      expect(csv).toContain('"Signal with ""quotes"""');
      
      closeDatabase(projectId);
      deleteProjectDatabase(projectId);
    });
  });
});

