# TrendFinder Cost Estimation Guide

## Overview

TrendFinder uses a hybrid AI approach to minimize costs while maintaining high-quality results. This guide explains the cost structure and helps you estimate expenses for your usage.

---

## Cost Structure

### Free Components (No Cost)

1. **Local Embeddings** (Phase 1)
   - Uses local AI models (Xenova Transformers)
   - Runs on your server
   - **Cost**: $0.00

2. **Similarity Calculations** (Phase 2)
   - Mathematical calculations using embeddings
   - Runs locally
   - **Cost**: $0.00

### Paid Components (Claude API)

1. **Signal Verification** (Phase 3 - Background Processing)
   - Claude verifies top 40 similar signals for each signal
   - Happens automatically after upload
   - **Cost**: ~$0.013 per signal

2. **Trend Summary Generation** (On-Demand)
   - Claude generates summaries when you create trends
   - Only happens when you click "Create Trend"
   - **Cost**: ~$0.001 per trend summary

---

## Cost Breakdown

### Per Signal Cost

**Background Processing (Phase 3)**:
- Each signal requires 1 Claude API call to verify up to 40 similar candidates
- Average cost per verification: **~$0.013**
- This is a one-time cost per signal

**Total per signal**: ~$0.013

### Per Trend Cost

**Summary Generation**:
- Each trend requires 1 Claude API call to generate a summary
- Average cost per summary: **~$0.001**
- Only charged when you create a trend

**Total per trend**: ~$0.001

---

## Cost Estimates by Project Size

### Small Project (100 signals)

| Component | Quantity | Cost per Unit | Total |
|-----------|----------|---------------|-------|
| Signal Verification | 100 | $0.013 | $1.30 |
| Trend Summaries (est. 10 trends) | 10 | $0.001 | $0.01 |
| **Total** | | | **~$1.31** |

### Medium Project (250 signals)

| Component | Quantity | Cost per Unit | Total |
|-----------|----------|---------------|-------|
| Signal Verification | 250 | $0.013 | $3.25 |
| Trend Summaries (est. 25 trends) | 25 | $0.001 | $0.03 |
| **Total** | | | **~$3.28** |

### Large Project (500 signals)

| Component | Quantity | Cost per Unit | Total |
|-----------|----------|---------------|-------|
| Signal Verification | 500 | $0.013 | $6.50 |
| Trend Summaries (est. 50 trends) | 50 | $0.001 | $0.05 |
| **Total** | | | **~$6.55** |

### Very Large Project (1,000 signals)

| Component | Quantity | Cost per Unit | Total |
|-----------|----------|---------------|-------|
| Signal Verification | 1,000 | $0.013 | $13.00 |
| Trend Summaries (est. 100 trends) | 100 | $0.001 | $0.10 |
| **Total** | | | **~$13.10** |

---

## Monthly Cost Estimates

### Light Usage (2-3 projects/month, ~250 signals each)

- Projects: 2-3 × $3.28 = **$6.56 - $9.84/month**

### Moderate Usage (5-10 projects/month, ~500 signals each)

- Projects: 5-10 × $6.55 = **$32.75 - $65.50/month**

### Heavy Usage (20+ projects/month, ~500 signals each)

- Projects: 20 × $6.55 = **$131.00/month**
- Plus additional projects as needed

---

## Cost Optimization Strategies

### 1. Pre-Filter Your Data

**Before Upload**:
- Remove duplicate signals
- Filter out low-quality or irrelevant entries
- Clean and normalize your data

**Savings**: Fewer signals = lower costs
- Removing 100 duplicates saves ~$1.30

### 2. Batch Processing

**Strategy**: Process multiple projects efficiently
- Upload and process during off-peak hours
- Let processing complete before starting new projects

**Benefit**: Better resource utilization, no wasted API calls

### 3. Review Before Creating Trends

**Strategy**: Only create trends for meaningful groups
- Review similar signals carefully
- Don't create trends for every group
- Archive signals that don't fit anywhere

**Savings**: Fewer trend summaries = lower costs
- Creating 10 fewer trends saves ~$0.01 (minimal, but adds up)

### 4. Use Retry Failed Verifications Wisely

**Strategy**: Only retry if necessary
- Most failures are temporary (rate limits)
- System automatically retries on next processing run
- Manual retry only if needed

**Benefit**: Avoids duplicate API calls

### 5. Monitor Processing Status

**Strategy**: Check processing progress regularly
- Ensure processing completes successfully
- Fix errors promptly to avoid re-processing

**Benefit**: Prevents wasted API calls on failed processing

---

## Cost Comparison

### TrendFinder (Hybrid Approach)

- **100 signals**: ~$1.31
- **500 signals**: ~$6.55
- **1,000 signals**: ~$13.10

### Naive Approach (All Claude)

If we used Claude for everything:
- **100 signals**: ~$50-100 (estimated)
- **500 signals**: ~$250-500 (estimated)
- **1,000 signals**: ~$500-1,000 (estimated)

**Savings**: TrendFinder achieves ~99% cost reduction compared to naive approaches

---

## Understanding Claude API Pricing

### Current Pricing (as of 2025)

TrendFinder uses **Claude Sonnet 3.5**:
- **Input**: ~$3 per million tokens
- **Output**: ~$15 per million tokens

### Our Usage

**Signal Verification**:
- Average prompt: ~2,000 tokens (input)
- Average response: ~200 tokens (output)
- Cost per call: ~$0.013

**Trend Summary**:
- Average prompt: ~500 tokens (input)
- Average response: ~100 tokens (output)
- Cost per call: ~$0.001

*Note: Actual costs may vary based on signal length and Claude API pricing changes*

---

## Budget Planning

### For Small Teams (1-5 users)

**Estimated Monthly Budget**: $20-50
- Assumes 3-5 projects per month
- ~250-500 signals per project
- Includes trend summaries

### For Medium Teams (5-20 users)

**Estimated Monthly Budget**: $100-300
- Assumes 10-20 projects per month
- ~500 signals per project
- Includes trend summaries

### For Large Teams (20+ users)

**Estimated Monthly Budget**: $300-1,000+
- Depends on usage patterns
- Consider enterprise pricing
- May need custom optimization

---

## Monitoring Costs

### Self-Hosted Deployment

If you're self-hosting:
1. **Monitor API Usage**: Check Claude API dashboard
2. **Set Budget Alerts**: Configure alerts in Claude API settings
3. **Track Per Project**: Use project metadata to track costs
4. **Review Logs**: Check processing logs for failed retries

### Cloud-Hosted Deployment

If using a hosted service:
- Check your service provider's billing dashboard
- Review usage reports
- Set up budget alerts if available

---

## Cost Optimization Tips

### 1. Start Small

- Begin with smaller test projects
- Understand the workflow before scaling
- Refine your data preparation process

### 2. Quality Over Quantity

- Focus on high-quality signals
- Remove noise before processing
- Better signals = better trends = better value

### 3. Regular Review

- Review and refine trends regularly
- Merge duplicate trends
- Archive irrelevant signals

### 4. Efficient Workflows

- Batch similar projects together
- Process during off-peak hours
- Monitor and fix errors promptly

---

## FAQ

### Q: Can I reduce costs by skipping Claude verification?

**A**: No, Claude verification is essential for quality. The hybrid approach already minimizes costs while maintaining quality.

### Q: What if processing fails?

**A**: Failed verifications are tracked separately. You can retry them without re-processing everything, avoiding duplicate costs.

### Q: Do I pay for archived signals?

**A**: Yes, archived signals are still verified during processing. However, they don't generate trend summary costs.

### Q: Can I process signals without creating trends?

**A**: Yes! You can review signals and archive them without creating trends, saving on trend summary costs.

### Q: What happens if I re-upload the same data?

**A**: Re-uploading will create new signals and trigger new processing, incurring costs again. Use "Clear Data" carefully.

### Q: Are there volume discounts?

**A**: Claude API pricing is per-token. For very high volume, consider contacting Anthropic for enterprise pricing.

---

## Cost Calculator

Use this formula to estimate your project costs:

```
Total Cost = (Number of Signals × $0.013) + (Number of Trends × $0.001)
```

**Example**:
- 500 signals, 50 trends
- Cost = (500 × $0.013) + (50 × $0.001)
- Cost = $6.50 + $0.05 = **$6.55**

---

## Additional Resources

- [Anthropic Claude API Pricing](https://www.anthropic.com/pricing)
- [TrendFinder User Guide](USER_GUIDE.md)
- [Environment Setup Guide](ENV_SETUP.md)

---

**Last Updated**: 2025-01-27  
**Note**: Claude API pricing may change. Check Anthropic's website for current rates.

