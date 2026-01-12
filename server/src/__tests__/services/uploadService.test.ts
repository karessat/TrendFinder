import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processSpreadsheetUpload, detectColumnMappings, ColumnMappings } from '../../services/uploadService';
import { getDatabase, closeDatabase, deleteProjectDatabase } from '../../config/database';
import { loadEnv } from '../../config/env';
import * as XLSX from '@e965/xlsx';

describe('uploadService', () => {
  const testProjectId = 'proj_testupload';

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
      closeDatabase(testProjectId);
      deleteProjectDatabase(testProjectId);
    } catch (e) {
      // Ignore cleanup errors
    }

    // Create test database with processing status
    const db = getDatabase(testProjectId);
    db.prepare(`
      INSERT INTO processing_status (project_id, total_signals, status)
      VALUES (?, 0, 'pending')
    `).run(testProjectId);
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

  describe('processSpreadsheetUpload', () => {
    it('processes a simple spreadsheet and creates signals', async () => {
      // Create a simple test spreadsheet in memory
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['ID', 'Text'],
        [1, 'Signal text 1'],
        [2, 'Signal text 2'],
        [3, 'Signal text 3']
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
      
      // Detect mappings and use them
      const mappings = detectColumnMappings(worksheet);
      // Ensure we have a description mapping
      if (!mappings.description) {
        mappings.description = 'Text';
      }
      
      const result = await processSpreadsheetUpload(testProjectId, buffer, mappings);
      
      expect(result.success).toBe(true);
      expect(result.signalCount).toBe(3);
      expect(result.processingStarted).toBe(false);
      expect(result.estimatedCost).toBeDefined();
      expect(result.estimatedMinutes).toBeGreaterThan(0);
      
      // Verify signals were created
      const db = getDatabase(testProjectId);
      const signals = db.prepare('SELECT * FROM signals').all();
      expect(signals.length).toBe(3);
      expect(signals[0].original_text).toContain('Signal text');
      closeDatabase(testProjectId);
    });

    it('uses provided column mappings when specified', async () => {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Short', 'Long Text Column'],
        [1, 'This is a long text signal'],
        [2, 'Another long text signal']
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
      
      const mappings: ColumnMappings = {
        description: 'Long Text Column'
      };
      
      const result = await processSpreadsheetUpload(testProjectId, buffer, mappings);
      
      expect(result.signalCount).toBe(2);
      
      const db = getDatabase(testProjectId);
      const signals = db.prepare('SELECT original_text FROM signals').all() as Array<{ original_text: string }>;
      expect(signals[0].original_text).toContain('long text signal');
      closeDatabase(testProjectId);
    });

    it('truncates text longer than 10000 characters', async () => {
      const longText = 'a'.repeat(15000);
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Text'],
        [longText]
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
      
      const mappings: ColumnMappings = {
        description: 'Text'
      };
      
      await processSpreadsheetUpload(testProjectId, buffer, mappings);
      
      const db = getDatabase(testProjectId);
      const signal = db.prepare('SELECT original_text FROM signals').get() as { original_text: string };
      expect(signal.original_text.length).toBe(10000);
      closeDatabase(testProjectId);
    });

    it('filters out empty rows', async () => {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Text'],
        ['This is a valid signal text that is long enough'],
        [''],
        ['   '], // Whitespace only
        ['This is another valid signal text that is also long enough']
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
      
      const mappings: ColumnMappings = {
        description: 'Text'
      };
      
      const result = await processSpreadsheetUpload(testProjectId, buffer, mappings);
      
      expect(result.signalCount).toBe(2); // Only 2 valid signals
      
      const db = getDatabase(testProjectId);
      const signals = db.prepare('SELECT original_text FROM signals').all() as Array<{ original_text: string }>;
      expect(signals.length).toBe(2);
      expect(signals[0].original_text).toContain('valid signal text');
      expect(signals[1].original_text).toContain('valid signal text');
      closeDatabase(testProjectId);
    });

    it('updates processing status with signal count', async () => {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Text'],
        ['This is signal number one with enough text'],
        ['This is signal number two with enough text'],
        ['This is signal number three with enough text']
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
      
      const mappings: ColumnMappings = {
        description: 'Text'
      };
      
      await processSpreadsheetUpload(testProjectId, buffer, mappings);
      
      const db = getDatabase(testProjectId);
      const status = db.prepare('SELECT * FROM processing_status WHERE project_id = ?').get(testProjectId) as { total_signals: number; status: string };
      expect(status.total_signals).toBe(3);
      expect(status.status).toBe('pending');
      closeDatabase(testProjectId);
    });

    it('calculates estimated cost and time', async () => {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Text'],
        ...Array(100).fill(0).map((_, i) => [`This is signal number ${i + 1} with enough text content for detection`])
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
      
      const mappings: ColumnMappings = {
        description: 'Text'
      };
      
      const result = await processSpreadsheetUpload(testProjectId, buffer, mappings);
      
      // 100 signals = ~$1.30 and ~4 minutes (100/500 * 6.5, 100/500 * 20)
      expect(result.estimatedCost).toContain('$');
      expect(result.estimatedMinutes).toBeGreaterThan(0);
      closeDatabase(testProjectId);
    });

    it('throws error for empty spreadsheet', async () => {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Text'] // Only header, no data
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
      
      const mappings: ColumnMappings = {
        description: 'Text'
      };
      
      await expect(processSpreadsheetUpload(testProjectId, buffer, mappings)).rejects.toThrow();
    });

    it('throws error when description column mapping is missing', async () => {
      // Create spreadsheet with only short text columns
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Col1', 'Col2'],
        ['a', 'b'],
        ['c', 'd']
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
      
      const mappings: ColumnMappings = {}; // Missing description
      
      await expect(processSpreadsheetUpload(testProjectId, buffer, mappings)).rejects.toThrow('Signal Description column is required');
    });
  });
});

