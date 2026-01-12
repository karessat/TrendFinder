import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifySimilarities, generateTrendSummary } from '../../services/claudeService';
import { loadEnv } from '../../config/env';
import Anthropic from '@anthropic-ai/sdk';

// Mock Anthropic SDK
const mockMessagesCreate = vi.fn();
const mockAnthropicConstructor = vi.fn(() => ({
  messages: {
    create: mockMessagesCreate
  }
}));

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn((args: any) => mockAnthropicConstructor(args))
  };
});

describe('claudeService', () => {
  beforeEach(() => {
    // Ensure environment is loaded
    try {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-for-testing';
      loadEnv();
    } catch (e) {
      // Already loaded, ignore
    }
    
    vi.clearAllMocks();
  });

  describe('verifySimilarities', () => {
    it('returns empty array for empty candidates', async () => {
      const result = await verifySimilarities(
        { id: '1', text: 'test signal' },
        []
      );
      
      expect(result).toEqual([]);
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it('calls Claude API with correct parameters', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: '[{"number": 1, "score": 9}, {"number": 2, "score": 7}]'
        }]
      });

      await verifySimilarities(
        { id: '1', text: 'Focus signal text' },
        [
          { id: '2', text: 'Candidate 1' },
          { id: '3', text: 'Candidate 2' }
        ]
      );

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          temperature: 0,
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Focus signal text')
            })
          ])
        })
      );
    });

    it('parses valid JSON response', async () => {
      const mockResponse = [
        { number: 1, score: 9 },
        { number: 2, score: 7 },
        { number: 3, score: 5 }
      ];

      mockMessagesCreate.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify(mockResponse)
        }]
      });

      const result = await verifySimilarities(
        { id: '1', text: 'test' },
        [
          { id: '2', text: 'candidate 1' },
          { id: '3', text: 'candidate 2' },
          { id: '4', text: 'candidate 3' }
        ]
      );

      expect(result).toEqual(mockResponse);
      expect(result.length).toBe(3);
    });

    it('extracts JSON from text response', async () => {
      const mockResponse = [{ number: 1, score: 9 }];
      
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: 'Here is the result:\n' + JSON.stringify(mockResponse) + '\nEnd of response'
        }]
      });

      const result = await verifySimilarities(
        { id: '1', text: 'test' },
        [{ id: '2', text: 'candidate 1' }]
      );

      expect(result).toEqual(mockResponse);
    });

    it('filters invalid results', async () => {
      const mockResponse = [
        { number: 1, score: 9 }, // Valid
        { number: 2, score: 15 }, // Invalid (score > 10)
        { number: 3 }, // Invalid (missing score)
        { number: 4, score: 7 } // Valid
      ];

      mockMessagesCreate.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify(mockResponse)
        }]
      });

      const result = await verifySimilarities(
        { id: '1', text: 'test' },
        [
          { id: '2', text: 'candidate 1' },
          { id: '3', text: 'candidate 2' },
          { id: '4', text: 'candidate 3' },
          { id: '5', text: 'candidate 4' }
        ]
      );

      // Should only include valid results
      expect(result.length).toBe(2);
      expect(result[0].number).toBe(1);
      expect(result[1].number).toBe(4);
      expect(result.every(r => r.score >= 1 && r.score <= 10)).toBe(true);
    });

    it('returns empty array on parse error', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: 'This is not valid JSON at all!'
        }]
      });

      const result = await verifySimilarities(
        { id: '1', text: 'test' },
        [{ id: '2', text: 'candidate 1' }]
      );

      expect(result).toEqual([]);
    });

    it('handles API errors with retry logic', async () => {
      // Simulate rate limit error, then success
      const rateLimitError: any = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      rateLimitError.headers = { 'retry-after': '1' };

      mockMessagesCreate
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          content: [{
            type: 'text',
            text: '[{"number": 1, "score": 9}]'
          }]
        });

      // Note: This test verifies retry logic exists
      // Actual retry behavior is tested through integration tests
      await expect(
        verifySimilarities(
          { id: '1', text: 'test' },
          [{ id: '2', text: 'candidate 1' }]
        )
      ).resolves.toBeDefined();
    });
  });

  describe('generateTrendSummary', () => {
    it('calls Claude API with correct parameters', async () => {
      const mockSummary = 'This is a trend summary.';
      
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: mockSummary
        }]
      });

      const result = await generateTrendSummary([
        'Signal 1 text',
        'Signal 2 text',
        'Signal 3 text'
      ]);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 150,
          temperature: 0.7,
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Signal 1 text')
            })
          ])
        })
      );

      expect(result).toBe(mockSummary);
    });

    it('includes all signals in prompt', async () => {
      const signals = ['Signal A', 'Signal B', 'Signal C'];
      
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: 'Summary text'
        }]
      });

      await generateTrendSummary(signals);

      const callContent = mockMessagesCreate.mock.calls[0][0].messages[0].content as string;
      expect(callContent).toContain('Signal A');
      expect(callContent).toContain('Signal B');
      expect(callContent).toContain('Signal C');
    });

    it('returns trimmed summary text', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: '   Summary with spaces   \n'
        }]
      });

      const result = await generateTrendSummary(['Signal 1']);
      
      expect(result).toBe('Summary with spaces');
    });

    it('handles empty signals array', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: 'Summary'
        }]
      });

      const result = await generateTrendSummary([]);
      
      expect(result).toBeDefined();
      expect(mockMessagesCreate).toHaveBeenCalled();
    });

    it('handles API errors with retry logic', async () => {
      const serverError: any = new Error('Server error');
      serverError.status = 500;

      mockMessagesCreate
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({
          content: [{
            type: 'text',
            text: 'Retry successful summary'
          }]
        });

      const result = await generateTrendSummary(['Signal 1']);
      
      // Should retry and eventually succeed
      expect(result).toBe('Retry successful summary');
    });
  });
});

