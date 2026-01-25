import Anthropic from '@anthropic-ai/sdk';
import { ClaudeVerificationResult } from '../types';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';

let anthropic: Anthropic;

function getClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: getEnv().ANTHROPIC_API_KEY
    });
  }
  return anthropic;
}

const MODEL = 'claude-sonnet-4-20250514';

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Sleep with optional jitter
 */
async function sleep(ms: number, jitter = true): Promise<void> {
  const delay = jitter ? ms + Math.random() * 200 : ms;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Get delay from rate limit headers or use exponential backoff
 */
function getRetryDelay(error: any, attempt: number, baseDelay: number): number {
  // Check for Anthropic rate limit headers
  if (error?.headers?.['retry-after']) {
    const retryAfter = parseInt(error.headers['retry-after'], 10);
    if (!isNaN(retryAfter)) {
      return retryAfter * 1000;
    }
  }
  
  // Check for x-ratelimit-reset header
  if (error?.headers?.['x-ratelimit-reset']) {
    const resetTime = new Date(error.headers['x-ratelimit-reset']).getTime();
    const now = Date.now();
    if (resetTime > now) {
      return Math.min(resetTime - now, 60000); // Cap at 60 seconds
    }
  }
  
  // Exponential backoff with jitter
  return baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any): boolean {
  // Rate limit errors
  if (error?.status === 429) return true;
  
  // Server errors
  if (error?.status >= 500 && error?.status < 600) return true;
  
  // Network errors
  if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') return true;
  
  // Anthropic overloaded error
  if (error?.error?.type === 'overloaded_error') return true;
  
  return false;
}

/**
 * Execute with retry logic
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = MAX_RETRIES, baseDelayMs = BASE_DELAY_MS } = options;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      if (!isRetryableError(error)) {
        logger.error({ error: error.message, attempt }, 'Non-retryable Claude API error');
        throw error;
      }
      
      if (attempt < maxRetries - 1) {
        const delay = getRetryDelay(error, attempt, baseDelayMs);
        logger.warn({ 
          error: error.message, 
          attempt: attempt + 1, 
          nextRetryMs: delay 
        }, 'Retrying Claude API call');
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Verify similarity between a focus signal and its candidates.
 * Used during background processing (Phase 3).
 */
export async function verifySimilarities(
  focusSignal: { id: string; text: string },
  candidates: Array<{ id: string; text: string }>
): Promise<ClaudeVerificationResult[]> {
  if (candidates.length === 0) {
    return [];
  }
  
  const candidateList = candidates
    .map((c, i) => `${i + 1}. ${c.text}`)
    .join('\n');
  
  const prompt = `You are helping identify similar signals in a foresight/horizon scanning project. Signals are observations about emerging changes, trends, or developments.

FOCUS SIGNAL:
"${focusSignal.text}"

CANDIDATE SIGNALS (identified as potentially similar by initial screening):
${candidateList}

TASK:
Evaluate each candidate for semantic similarity to the focus signal. Two signals are similar if they:
- Describe the same underlying trend or phenomenon
- Would logically be grouped together when identifying patterns
- Represent different facets or examples of the same development

Even if signals use completely different words, they should be marked as similar if they point to the same underlying trend.

SCORING:
- 9-10: Nearly identical trend, clearly the same phenomenon
- 7-8: Strongly related, same underlying development
- 5-6: Moderately related, overlapping themes, could be grouped
- 3-4: Loosely related, tangential connection
- 1-2: Minimal connection, probably not the same trend

Return a JSON array of objects with "number" (candidate number) and "score" (1-10).
Only include candidates that score 5 or higher.
Return ONLY the JSON array, no other text.

Example: [{"number": 1, "score": 9}, {"number": 5, "score": 7}, {"number": 12, "score": 5}]`;

  return withRetry(async () => {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const text = response.content[0].type === 'text' 
      ? response.content[0].text.trim() 
      : '';
    
    // Try to find JSON array in response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as any[];
        
        // Validate structure
        if (!Array.isArray(parsed)) {
          throw new Error('Parsed result is not an array');
        }
        
        // Validate each item has required fields
        const validated = parsed.filter((item): item is ClaudeVerificationResult => {
          return (
            typeof item === 'object' &&
            item !== null &&
            typeof item.number === 'number' &&
            typeof item.score === 'number' &&
            item.score >= 1 &&
            item.score <= 10
          );
        });
        
        if (validated.length !== parsed.length) {
          logger.warn({ 
            total: parsed.length, 
            valid: validated.length 
          }, 'Some Claude verification results were invalid');
        }
        
        return validated;
      } catch (parseError) {
        logger.error({ response: text, error: parseError }, 'Failed to parse Claude JSON response');
        return [];
      }
    }
    
    logger.warn({ response: text }, 'Claude returned non-JSON response');
    return [];
  });
}

/**
 * Generate a trend summary and title from grouped signals.
 * Used on-demand when user creates a trend.
 */
export interface TrendGenerationResult {
  title: string;  // 1-3 words describing what is changing and how
  summary: string;  // 2-3 sentences describing the trend
}

export async function generateTrendSummary(signalTexts: string[]): Promise<TrendGenerationResult> {
  const signalList = signalTexts
    .map((text, i) => `${i + 1}. ${text}`)
    .join('\n');
  
  const prompt = `You are helping identify trends from a collection of signals (observations about change) in a foresight/horizon scanning project.

The following signals have been identified as related. Generate:
1. A short title (1-3 words) that describes what is changing and how it's changing
2. A concise summary (2-3 sentences) that describes the underlying pattern

SIGNALS:
${signalList}

REQUIREMENTS FOR TITLE:
- Exactly 1-3 words (prefer 2-3 words)
- Describe what is changing and how it's changing
- WHERE POSSIBLE, use words from the original signal descriptions
- Use title case (capitalize important words)
- Be short, specific, and to the point
- Examples: "Subscription Economy Growth", "Remote Work Adoption", "Circular Economy Models"

REQUIREMENTS FOR SUMMARY:
- Write exactly 2-3 sentences
- Maximum 65 words
- Focus on the underlying trend, not the individual signals
- Use present tense
- Describe the CHANGE that is happening, NOT its implications or consequences
- Do NOT explain why the trend matters, what it enables, or what benefits it provides
- Simply describe what is occurring - the observable change or pattern
- Be specific and factual about the change itself

IMPORTANT: Return ONLY a valid JSON object with "title" and "summary" fields. No other text before or after the JSON.
Example format:
{
  "title": "Subscription Economy Growth",
  "summary": "Businesses are shifting from ownership to access-based models. Companies are offering subscription services across multiple industries including software, transportation, and consumer goods."
}`;

  return withRetry(async () => {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 200,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const text = response.content[0].type === 'text' 
      ? response.content[0].text.trim() 
      : '';
    
    // Try to parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as { title?: string; summary?: string };
        if (parsed.title && parsed.summary) {
          return {
            title: parsed.title.trim(),
            summary: parsed.summary.trim()
          };
        }
      } catch (parseError) {
        logger.warn({ parseError, text: text.substring(0, 500) }, 'Failed to parse trend generation JSON, falling back to text extraction');
      }
      
      // Log if title or summary is missing from parsed JSON
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as { title?: string; summary?: string };
          if (!parsed.title || !parsed.summary) {
            logger.warn({ parsed, text: text.substring(0, 500) }, 'Generated JSON missing title or summary, falling back to text extraction');
          }
        } catch {
          // Already handled above
        }
      }
    }
    
    // Fallback: extract title from first line, summary from rest
    const lines = text.split('\n').filter(l => l.trim());
    // Limit to 3 words for title
    const title = lines[0]?.trim().split(/\s+/).slice(0, 3).join(' ') || 'Trend';
    const summary = lines.slice(1).join(' ').trim() || text.trim();
    
    return {
      title: title.length > 50 ? title.substring(0, 50) : title,
      summary: summary.length > 500 ? summary.substring(0, 500) : summary
    };
  });
}

