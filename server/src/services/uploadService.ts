import * as XLSX from '@e965/xlsx';
import { getDatabase, closeDatabase } from '../config/database';
import { logger } from '../config/logger';
import { SignalStatus } from '../types';

export interface ColumnMappings {
  description?: string;  // Column name for Signal Description (required)
  title?: string;        // Column name for Signal Title (optional)
  source?: string;       // Column name for Signal Source (optional)
  status?: string;       // Column name for Signal Status (optional)
  id?: string;           // Column name for Signal ID (optional)
  note?: string;         // Column name for Note (optional)
}

export interface UploadPreview {
  columns: string[];
  detectedMappings: ColumnMappings;
  sampleRows: Array<Record<string, any>>;  // First 5 rows as preview
}

export interface UploadResult {
  success: boolean;
  signalCount: number;
  detectedColumn?: string;  // Kept for backward compatibility
  detectedMappings?: ColumnMappings;  // New: detected column mappings
  processingStarted: boolean;
  estimatedCost: string;
  estimatedMinutes: number;
  warnings?: string[];  // New: warnings about duplicate IDs, invalid statuses, etc.
}

export interface ProcessedSignal {
  id: string;
  original_text: string;
  title: string | null;
  source: string | null;
  note: string | null;
  status: SignalStatus;
}

/**
 * Detect column mappings based on column names (case-insensitive)
 */
export function detectColumnMappings(sheet: XLSX.WorkSheet): ColumnMappings {
  const mappings: ColumnMappings = {};
  
  if (!sheet || Object.keys(sheet).length === 0) {
    return mappings;
  }
  
  // Get column headers from first row
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const headers: string[] = [];
  
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    const cell = sheet[cellAddress];
    if (cell && cell.v) {
      headers[col] = String(cell.v).trim();
    }
  }
  
  // Column name patterns for auto-detection (case-insensitive)
  const patterns: Record<string, string[]> = {
    description: ['description', 'text', 'signal', 'content', 'details', 'signal description', 'signal text'],
    title: ['title', 'name', 'heading', 'subject', 'signal title'],
    source: ['source', 'url', 'link', 'reference', 'signal source'],
    status: ['status', 'state', 'signal status'],
    id: ['id', 'signal_id', 'signalid', 'signal id'],
    note: ['note', 'notes', 'comment', 'comments']
  };
  
  // Match column headers to patterns
  for (const [field, patternsList] of Object.entries(patterns)) {
    for (const header of headers) {
      if (!header) continue;
      const headerLower = header.toLowerCase().trim();
      if (patternsList.some(pattern => headerLower.includes(pattern.toLowerCase()))) {
        mappings[field as keyof ColumnMappings] = header;
        break;
      }
    }
  }
  
  // If no description found, use longest column as fallback
  if (!mappings.description && headers.length > 0) {
    let longestHeader = '';
    let longestLength = 0;
    for (const header of headers) {
      if (header && header.length > longestLength) {
        longestHeader = header;
        longestLength = header.length;
      }
    }
    if (longestHeader) {
      mappings.description = longestHeader;
    }
  }
  
  return mappings;
}

/**
 * Get upload preview with detected mappings and sample data
 */
export async function getUploadPreview(buffer: Buffer): Promise<UploadPreview> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    
    if (!sheet) {
      throw new Error('Spreadsheet has no data');
    }
    
    // Convert to JSON with headers
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Array<Record<string, any>>;
    
    if (jsonData.length === 0) {
      throw new Error('Spreadsheet contains no data rows');
    }
    
    // Get all column names
    const columns = Object.keys(jsonData[0] || {});
    
    // Detect mappings
    const detectedMappings = detectColumnMappings(sheet);
    
    // Get first 5 rows as sample
    const sampleRows = jsonData.slice(0, 5);
    
    return {
      columns,
      detectedMappings,
      sampleRows
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get upload preview');
    throw error;
  }
}

/**
 * Detect the text column in a spreadsheet (longest average cell length)
 * @deprecated Use detectColumnMappings instead
 */
function detectTextColumn(sheet: XLSX.WorkSheet): string | null {
  if (!sheet || Object.keys(sheet).length === 0) {
    return null;
  }
  
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const columns: { [key: string]: { total: number; count: number } } = {};
  
  // Sample first 50 rows to detect column
  const maxRows = Math.min(range.e.r, 50);
  
  for (let row = range.s.r; row <= maxRows; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      
      if (cell && cell.v) {
        const colLetter = XLSX.utils.encode_col(col);
        if (!columns[colLetter]) {
          columns[colLetter] = { total: 0, count: 0 };
        }
        columns[colLetter].total += String(cell.v).length;
        columns[colLetter].count += 1;
      }
    }
  }
  
  let bestColumn: string | null = null;
  let bestAvg = 0;
  
  for (const [col, stats] of Object.entries(columns)) {
    const avg = stats.total / stats.count;
    if (avg > bestAvg && avg > 10) { // Minimum 10 chars average
      bestAvg = avg;
      bestColumn = col;
    }
  }
  
  return bestColumn;
}

/**
 * Generate next sequential numeric signal ID (0001-9999, then extends if needed)
 * Finds the highest existing numeric ID and increments it
 */
function getNextSignalId(db: any): string {
  // Get all existing signal IDs that are numeric
  const existingSignals = db.prepare('SELECT id FROM signals').all() as Array<{ id: string }>;
  
  // Find the highest numeric ID
  let maxId = 0;
  for (const signal of existingSignals) {
    const idNum = parseInt(signal.id, 10);
    if (!isNaN(idNum) && idNum > maxId) {
      maxId = idNum;
    }
  }
  
  // Increment and format
  const nextId = maxId + 1;
  
  // Format: 4 digits (0001-9999), or extend to 5+ digits if needed
  if (nextId <= 9999) {
    return nextId.toString().padStart(4, '0');
  } else {
    // Extend to more digits if needed (10000, 10001, etc.)
    return nextId.toString();
  }
}

/**
 * Validate imported status value
 */
function validateStatus(statusStr: string): SignalStatus | null {
  const normalized = statusStr.trim();
  // Accept both display and internal status values
  if (['Pending', 'pending'].includes(normalized)) return 'unassigned';
  if (['Combined', 'combined'].includes(normalized)) return 'assigned';
  if (['Archived', 'archived'].includes(normalized)) return 'retired';
  // Also accept internal values for backward compatibility
  if (normalized === 'unassigned') return 'unassigned';
  if (normalized === 'assigned') return 'assigned';
  if (normalized === 'retired') return 'retired';
  return null;
}

/**
 * Validate URL format
 */
function validateUrl(urlStr: string): boolean {
  if (!urlStr || !urlStr.trim()) return false;
  try {
    const url = new URL(urlStr.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Process uploaded spreadsheet and create signals with column mappings
 */
export async function processSpreadsheetUpload(
  projectId: string,
  buffer: Buffer,
  mappings: ColumnMappings
): Promise<UploadResult> {
  const db = getDatabase(projectId);
  
  try {
    // Parse workbook
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    
    if (!sheet) {
      throw new Error('Spreadsheet has no data');
    }
    
    // Require description column
    if (!mappings.description) {
      throw new Error('Signal Description column is required');
    }
    
    // Convert to JSON with column headers
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    
    if (jsonData.length === 0) {
      throw new Error('Spreadsheet contains no data rows');
    }
    
    const processedSignals: ProcessedSignal[] = [];
    const warnings: string[] = [];
    const duplicateIds: string[] = [];
    const invalidStatuses: string[] = [];
    const invalidUrls: string[] = [];
    
    // Check for existing signal IDs in database
    const existingIds = new Set<string>();
    const existingSignals = db.prepare('SELECT id FROM signals').all() as Array<{ id: string }>;
    existingSignals.forEach(s => existingIds.add(s.id));
    
    // Get the starting ID for this batch (will increment as we go)
    let nextAutoId = getNextSignalId(db);
    
    for (const row of jsonData as any[]) {
      const description = String(row[mappings.description] || '').trim();
      
      // Skip rows without description (required field)
      if (!description || description.length === 0) {
        continue;
      }
      
      // Validate description length
      const trimmedDescription = description.length > 10000 ? description.substring(0, 10000) : description;
      
      // Get or generate ID
      let signalId: string;
      if (mappings.id && row[mappings.id]) {
        const importedId = String(row[mappings.id]).trim();
        if (importedId && importedId.length > 0) {
          // Normalize imported ID: if it's numeric, pad it to 4 digits; otherwise use as-is
          const importedIdNum = parseInt(importedId, 10);
          const normalizedId = !isNaN(importedIdNum) 
            ? importedIdNum.toString().padStart(4, '0')
            : importedId;
          
          // Check for duplicates in current import batch
          if (processedSignals.some(s => s.id === normalizedId)) {
            duplicateIds.push(importedId);
            // Generate sequential ID for duplicate
            while (existingIds.has(nextAutoId) || processedSignals.some(s => s.id === nextAutoId)) {
              const nextNum = parseInt(nextAutoId, 10) + 1;
              nextAutoId = nextNum <= 9999 
                ? nextNum.toString().padStart(4, '0')
                : nextNum.toString();
            }
            signalId = nextAutoId;
            const nextNum = parseInt(nextAutoId, 10) + 1;
            nextAutoId = nextNum <= 9999 
              ? nextNum.toString().padStart(4, '0')
              : nextNum.toString();
          } else if (existingIds.has(normalizedId)) {
            duplicateIds.push(importedId);
            // Generate sequential ID for duplicate
            while (existingIds.has(nextAutoId) || processedSignals.some(s => s.id === nextAutoId)) {
              const nextNum = parseInt(nextAutoId, 10) + 1;
              nextAutoId = nextNum <= 9999 
                ? nextNum.toString().padStart(4, '0')
                : nextNum.toString();
            }
            signalId = nextAutoId;
            const nextNum = parseInt(nextAutoId, 10) + 1;
            nextAutoId = nextNum <= 9999 
              ? nextNum.toString().padStart(4, '0')
              : nextNum.toString();
          } else {
            signalId = normalizedId;
            // If imported ID is numeric and higher than our counter, update counter
            if (!isNaN(importedIdNum) && importedIdNum >= parseInt(nextAutoId, 10)) {
              const nextNum = importedIdNum + 1;
              nextAutoId = nextNum <= 9999 
                ? nextNum.toString().padStart(4, '0')
                : nextNum.toString();
            }
          }
        } else {
          // Auto-generate sequential ID
          while (existingIds.has(nextAutoId) || processedSignals.some(s => s.id === nextAutoId)) {
            const nextNum = parseInt(nextAutoId, 10) + 1;
            nextAutoId = nextNum <= 9999 
              ? nextNum.toString().padStart(4, '0')
              : nextNum.toString();
          }
          signalId = nextAutoId;
          const nextNum = parseInt(nextAutoId, 10) + 1;
          nextAutoId = nextNum <= 9999 
            ? nextNum.toString().padStart(4, '0')
            : nextNum.toString();
        }
      } else {
        // Auto-generate sequential ID
        while (existingIds.has(nextAutoId) || processedSignals.some(s => s.id === nextAutoId)) {
          const nextNum = parseInt(nextAutoId, 10) + 1;
          nextAutoId = nextNum <= 9999 
            ? nextNum.toString().padStart(4, '0')
            : nextNum.toString();
        }
        signalId = nextAutoId;
        const nextNum = parseInt(nextAutoId, 10) + 1;
        nextAutoId = nextNum <= 9999 
          ? nextNum.toString().padStart(4, '0')
          : nextNum.toString();
      }
      
      // Get title
      const title = mappings.title && row[mappings.title] 
        ? String(row[mappings.title]).trim().substring(0, 500) 
        : null;
      
      // Get source (validate URL)
      let source: string | null = null;
      if (mappings.source && row[mappings.source]) {
        const sourceStr = String(row[mappings.source]).trim();
        if (sourceStr && validateUrl(sourceStr)) {
          source = sourceStr;
        } else if (sourceStr) {
          invalidUrls.push(sourceStr);
        }
      }
      
      // Get status
      let status: SignalStatus = 'unassigned';
      if (mappings.status && row[mappings.status]) {
        const statusStr = String(row[mappings.status]).trim();
        const validatedStatus = validateStatus(statusStr);
        if (validatedStatus) {
          status = validatedStatus;
        } else if (statusStr) {
          invalidStatuses.push(statusStr);
        }
      }
      
      // Get note
      const note = mappings.note && row[mappings.note] 
        ? String(row[mappings.note]).trim().substring(0, 5000) 
        : null;
      
      processedSignals.push({
        id: signalId,
        original_text: trimmedDescription,
        title: title || null,
        source: source,
        note: note || null,
        status
      });
    }
    
    if (processedSignals.length === 0) {
      throw new Error('No valid signals found in spreadsheet');
    }
    
    // Collect warnings
    if (duplicateIds.length > 0) {
      warnings.push(`${duplicateIds.length} duplicate Signal ID(s) found. New IDs were generated.`);
    }
    if (invalidStatuses.length > 0) {
      warnings.push(`${invalidStatuses.length} invalid status value(s) found. Defaulted to 'Pending'.`);
    }
    if (invalidUrls.length > 0) {
      warnings.push(`${invalidUrls.length} invalid URL(s) found. Source field skipped for these.`);
    }
    
    // Insert signals in batch
    const insertStmt = db.prepare(`
      INSERT INTO signals (id, original_text, title, source, note, status) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((signals: ProcessedSignal[]) => {
      for (const signal of signals) {
        insertStmt.run(
          signal.id,
          signal.original_text,
          signal.title,
          signal.source,
          signal.note,
          signal.status
        );
      }
    });
    
    insertMany(processedSignals);
    
    // Update processing status
    db.prepare(`
      UPDATE processing_status 
      SET total_signals = ?, 
          embeddings_complete = 0,
          embedding_similarities_complete = 0,
          claude_verifications_complete = 0,
          status = 'pending',
          started_at = NULL,
          completed_at = NULL,
          error_message = NULL
      WHERE project_id = ?
    `).run(processedSignals.length, projectId);
    
    // Estimate cost (from plan: ~$6.50 for 500 signals)
    const estimatedCost = (processedSignals.length / 500 * 6.5).toFixed(2);
    const estimatedMinutes = Math.ceil(processedSignals.length / 500 * 20); // ~20 min for 500 signals
    
    logger.info({ 
      projectId, 
      signalCount: processedSignals.length,
      mappings 
    }, 'Spreadsheet uploaded and processed');
    
    return {
      success: true,
      signalCount: processedSignals.length,
      detectedColumn: mappings.description, // For backward compatibility
      detectedMappings: mappings,
      processingStarted: false, // Will be started by route handler
      estimatedCost: `$${estimatedCost}`,
      estimatedMinutes,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  } catch (error) {
    logger.error({ projectId, error }, 'Spreadsheet upload failed');
    throw error;
  } finally {
    closeDatabase(projectId);
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use processSpreadsheetUpload with ColumnMappings instead
 */
export async function processSpreadsheetUploadLegacy(
  projectId: string,
  buffer: Buffer,
  textColumn?: string
): Promise<UploadResult> {
  const db = getDatabase(projectId);
  
  try {
    // Parse workbook
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    
    if (!sheet) {
      throw new Error('Spreadsheet has no data');
    }
    
    // Detect mappings or use provided column
    let mappings: ColumnMappings;
    if (textColumn) {
      mappings = { description: textColumn };
    } else {
      mappings = detectColumnMappings(sheet);
      if (!mappings.description) {
        const detectedColumn = detectTextColumn(sheet);
        if (!detectedColumn) {
          throw new Error('Could not detect text column. Please specify manually.');
        }
        mappings.description = detectedColumn;
      }
    }
    
    return processSpreadsheetUpload(projectId, buffer, mappings);
  } catch (error) {
    logger.error({ projectId, error }, 'Spreadsheet upload failed');
    throw error;
  } finally {
    closeDatabase(projectId);
  }
}

