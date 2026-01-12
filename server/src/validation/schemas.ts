import { z } from 'zod';

// Project validation
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long')
});

// Signal validation
export const createSignalSchema = z.object({
  description: z.string().min(1, 'Description is required').max(10000, 'Description too long'),
  title: z.string().max(500, 'Title too long').optional(),
  source: z.string().url('Invalid URL format').optional().or(z.literal('')),
  status: z.enum(['Pending', 'Combined', 'Archived']).optional(),
  note: z.string().max(5000, 'Note too long').optional()
});

export const updateSignalSchema = z.object({
  description: z.string().min(1).max(10000).optional(),
  title: z.string().max(500).optional().nullable(),
  source: z.string().url().optional().nullable().or(z.literal('')),
  status: z.enum(['Pending', 'Combined', 'Archived']).optional(),
  note: z.string().max(5000).optional().nullable()
}).refine(data => data.description || data.title !== undefined || data.source !== undefined || data.status !== undefined || data.note !== undefined, {
  message: 'At least one field required'
});

// Trend validation
// Signal IDs can be numeric (e.g., "0001") or UUIDs
export const createTrendSchema = z.object({
  signalIds: z.array(z.string().min(1)).min(1, 'At least one signal required').max(50, 'Too many signals')
});

export const updateTrendSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  summary: z.string().min(1).max(1000).optional(),
  status: z.enum(['draft', 'final', 'retired', 'archived']).optional(),
  note: z.string().max(5000).optional().nullable()
});

export const addRemoveSignalsSchema = z.object({
  signalIds: z.array(z.string().min(1)).min(1).max(50),
  regenerateSummary: z.boolean().optional().default(false)
});

// Query params validation
export const signalListQuerySchema = z.object({
  status: z.enum(['Pending', 'Combined', 'Archived', 'unassigned', 'assigned', 'retired']).optional(), // Support both display and internal status
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0)
});

// Validation middleware helper
export function validate<T>(schema: z.Schema<T>) {
  return (req: any, res: any, next: any) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.errors.map(e => e.message).join(', ')
      });
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: z.Schema<T>) {
  return (req: any, res: any, next: any) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: result.error.errors.map(e => e.message).join(', ')
      });
    }
    req.query = result.data;
    next();
  };
}

