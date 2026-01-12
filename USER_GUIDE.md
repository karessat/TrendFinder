# TrendFinder User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Creating Projects](#creating-projects)
3. [Uploading Data](#uploading-data)
4. [Understanding Processing](#understanding-processing)
5. [Reviewing Signals](#reviewing-signals)
6. [Creating and Managing Trends](#creating-and-managing-trends)
7. [Exporting Data](#exporting-data)
8. [Managing Signals](#managing-signals)
9. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Registration and Login

1. **Create an Account**
   - Navigate to the registration page
   - Enter your email address and create a password (minimum 8 characters)
   - Optionally provide your name
   - Click "Sign up" to create your account

2. **Login**
   - Enter your email and password
   - Click "Sign in"
   - You'll be redirected to your project dashboard

3. **Forgot Password**
   - If you forget your password, click "Forgot your password?" on the login page
   - Enter your email address
   - Check your email for a password reset link (valid for 1 hour)
   - Click the link and set a new password

---

## Creating Projects

A **project** is a container for all your signals and trends. Each project is isolated from others.

### Create a New Project

1. From the dashboard, click "Create Project" (if you have no projects) or use the project creation option
2. Enter a descriptive name for your project
3. Click "Create"
4. You'll be redirected to the project dashboard

### Project Dashboard

The project dashboard shows:
- **Total Signals**: Number of signals in the project
- **Total Trends**: Number of trends created
- **Processing Status**: Current state of data processing

---

## Uploading Data

### Supported File Formats

- **Excel files** (.xlsx, .xls)
- **CSV files** (.csv)

### File Requirements

- Maximum file size: 10MB (default, configurable)
- Each row should represent one signal
- Required columns: A column containing the signal text (description)

### Upload Process

1. **Navigate to Upload Page**
   - From the project dashboard, click "Upload Spreadsheet"

2. **Select Your File**
   - Click "Choose File" or drag and drop your file
   - Supported formats: Excel (.xlsx, .xls) or CSV (.csv)

3. **Configure Column Mappings**
   - The system will detect columns in your file
   - Map columns to signal fields:
     - **Description** (required): The main text content of the signal
     - **Title** (optional): A short title for the signal
     - **Source** (optional): Where the signal came from
     - **Status** (optional): Current status of the signal
     - **ID** (optional): External identifier
     - **Note** (optional): Additional notes

4. **Upload**
   - Click "Upload" to start the import
   - Signals will be imported and processing will begin automatically

### Column Mapping Tips

- **Description** is the most important field - this is what gets analyzed for similarity
- If your file has a single text column, map it to "Description"
- You can leave optional fields unmapped if not available

---

## Understanding Processing

After uploading, TrendFinder processes your signals in three phases:

### Phase 1: Embedding Generation
- **What it does**: Creates semantic representations of each signal using local AI
- **Speed**: Fast (~50-100ms per signal)
- **Cost**: Free (runs locally)
- **Progress**: Shows "Embeddings: X / Total"

### Phase 2: Similarity Calculation
- **What it does**: Calculates initial similarity scores between signals using embeddings
- **Speed**: Very fast (mathematical calculations)
- **Cost**: Free (runs locally)
- **Progress**: Shows "Similarities: X / Total"

### Phase 3: Claude Verification
- **What it does**: Uses Claude AI to verify and score the top 40 similar signals for each signal
- **Speed**: Moderate (depends on API rate limits)
- **Cost**: ~$0.013 per signal (see [Cost Estimation Guide](COST_ESTIMATION.md))
- **Progress**: Shows "Claude Verification: X / Total"

### Processing Status

You can monitor processing on the project dashboard:
- **Pending**: Processing hasn't started
- **Embedding**: Phase 1 in progress
- **Embedding Similarity**: Phase 2 in progress
- **Claude Verification**: Phase 3 in progress
- **Complete**: All processing finished
- **Error**: Processing encountered an error (signals may still be reviewable)

### Processing Time Estimates

| Signals | Estimated Time |
|---------|----------------|
| 100     | ~5 minutes     |
| 250     | ~10 minutes    |
| 500     | ~20 minutes    |
| 1000    | ~40 minutes    |

*Times are approximate and depend on system resources and API rate limits*

### What to Do During Processing

- You can navigate away from the dashboard
- Processing continues in the background
- Check back periodically to see progress
- **You cannot review signals until processing is complete**

---

## Reviewing Signals

Once processing is complete, you can start reviewing and grouping signals into trends.

### Accessing Signal Review

1. From the project dashboard, click "Start Review"
2. If processing is still in progress, you'll see an alert and the button will be disabled

### Review Workflow

1. **View Current Signal**
   - The system shows you one unassigned signal at a time
   - This is the "focus signal" you're working with

2. **See Similar Signals**
   - Below the focus signal, you'll see a list of similar signals
   - These are pre-verified by Claude AI as similar (score ≥ 5/10)
   - Similar signals are sorted by similarity score (highest first)

3. **Select Signals to Group**
   - Check the boxes next to signals that belong together
   - You can select multiple signals to create a trend
   - The focus signal is automatically included

4. **Create Trend**
   - Click "Create Trend" to group the selected signals
   - Claude AI will generate a summary of the trend
   - The signals will be marked as "assigned" and removed from the review queue

5. **Archive Signal**
   - If a signal doesn't fit with any others, click "Archive Signal"
   - Archived signals are marked as assigned but not grouped into a trend

6. **Move to Next Signal**
   - After creating a trend or archiving, the next unassigned signal appears automatically

### Tips for Reviewing

- **Trust but verify**: Claude's similarity scores are a starting point - use your judgment
- **Group related signals**: Signals that describe the same underlying trend should be grouped
- **Be consistent**: Similar signals should be grouped together across your review session
- **Take breaks**: You can stop and resume reviewing at any time

---

## Creating and Managing Trends

### What is a Trend?

A **trend** is a group of related signals that represent the same underlying pattern or development. Each trend has:
- **Summary**: A 2-3 sentence description generated by Claude AI
- **Signals**: The signals that belong to this trend
- **Created date**: When the trend was created

### Viewing Trends

1. From the project dashboard, click "View Trends"
2. You'll see a list of all trends in the project
3. Each trend card shows:
   - The trend summary
   - Number of signals in the trend
   - Creation date

### Editing Trends

1. Click on a trend to view details
2. You can:
   - **Edit the summary**: Modify the AI-generated summary
   - **Add signals**: Add more signals to the trend
   - **Remove signals**: Remove signals from the trend
   - **Regenerate summary**: Have Claude AI create a new summary based on current signals
   - **Delete trend**: Remove the trend (signals become unassigned)

### Best Practices

- **Review summaries**: AI-generated summaries are a starting point - edit them for clarity
- **Keep trends focused**: Each trend should represent one clear pattern
- **Merge similar trends**: If you have multiple trends that are very similar, consider merging them

---

## Exporting Data

You can export your processed data in CSV format for analysis in Excel, Google Sheets, or other tools.

### Export Options

1. **Trends CSV**
   - Exports all trends with their summaries
   - Includes trend ID, summary, signal count, and creation date

2. **Signals CSV**
   - Exports all signals with their details
   - Includes signal text, status, assigned trend, and timestamps

3. **Summary CSV**
   - Exports a summary view
   - Shows trends with their associated signals

### How to Export

1. From the project dashboard, click "Export Data"
2. Choose the export type you want
3. Click the export button
4. The CSV file will download automatically

### Using Exported Data

- Open in Excel, Google Sheets, or any spreadsheet application
- Use for further analysis, reporting, or sharing
- Import into other tools for visualization or analysis

---

## Managing Signals

### View All Signals

1. From the project dashboard, click "Manage Signals"
2. You'll see a table of all signals in the project

### Signal Information

Each signal shows:
- **Text**: The original signal content
- **Status**: Unassigned, Assigned, or Archived
- **Trend**: Which trend it belongs to (if assigned)
- **Created/Updated**: Timestamps

### Editing Signals

1. Click on a signal to view details
2. You can:
   - **Edit text**: Modify the signal content
   - **Change status**: Mark as assigned or unassigned
   - **Assign to trend**: Move signal to a different trend
   - **Delete signal**: Remove the signal from the project

### Filtering and Searching

- Use the status filter to show only unassigned, assigned, or archived signals
- Search by signal text to find specific signals

---

## Troubleshooting

### Upload Issues

**Problem**: File upload fails
- **Solution**: Check file size (max 10MB), ensure file is Excel or CSV format
- **Solution**: Verify column mappings are correct

**Problem**: Signals not importing correctly
- **Solution**: Check that the Description column is mapped correctly
- **Solution**: Ensure your file has proper headers

### Processing Issues

**Problem**: Processing seems stuck
- **Solution**: Processing can take time - check the progress bar
- **Solution**: Large datasets (1000+ signals) can take 30-40 minutes
- **Solution**: If stuck for hours, check server logs or contact support

**Problem**: Processing shows "Error" status
- **Solution**: Some signals may still be reviewable
- **Solution**: Try the "Retry Failed Verifications" option if available
- **Solution**: Check that your API key is valid and has sufficient credits

**Problem**: "Review Signals" button is disabled
- **Solution**: Processing must be complete before reviewing
- **Solution**: Wait for processing to finish (status shows "Complete")
- **Solution**: Check the processing progress on the dashboard

### Review Issues

**Problem**: No similar signals shown
- **Solution**: This is normal - not all signals have similar matches
- **Solution**: You can still create a trend with just the focus signal
- **Solution**: Or archive the signal if it doesn't fit anywhere

**Problem**: Similar signals don't seem related
- **Solution**: Claude's similarity is semantic - it may group conceptually related but differently-worded signals
- **Solution**: Use your judgment - you can choose not to group signals
- **Solution**: You can manually add signals to trends later

### Account Issues

**Problem**: Can't log in
- **Solution**: Check that you're using the correct email and password
- **Solution**: Use "Forgot password" to reset if needed
- **Solution**: Ensure cookies are enabled in your browser

**Problem**: Password reset email not received
- **Solution**: Check spam/junk folder
- **Solution**: Verify email address is correct
- **Solution**: Reset link expires after 1 hour - request a new one

### Performance Issues

**Problem**: App feels slow
- **Solution**: Large projects (1000+ signals) may be slower
- **Solution**: Try refreshing the page
- **Solution**: Check your internet connection

**Problem**: Processing is very slow
- **Solution**: This is normal for large datasets
- **Solution**: Processing runs in the background - you can close the browser
- **Solution**: Check server resources if self-hosting

---

## Tips and Best Practices

### Data Preparation

- **Clean your data**: Remove duplicates and irrelevant entries before uploading
- **Consistent formatting**: Use consistent terminology and formatting
- **Good descriptions**: Clear, descriptive signal text works best

### Review Efficiency

- **Work in batches**: Review signals in focused sessions
- **Use keyboard shortcuts**: Check if available in your browser
- **Take notes**: Use signal notes field to track your thoughts

### Trend Management

- **Regular review**: Periodically review and refine your trends
- **Merge duplicates**: Combine similar trends to reduce clutter
- **Clear summaries**: Edit AI summaries to be clear and actionable

### Cost Management

- **Batch uploads**: Process multiple projects efficiently
- **Monitor usage**: Track your API costs (see [Cost Estimation Guide](COST_ESTIMATION.md))
- **Optimize signals**: Remove low-quality signals before processing

---

## Getting Help

If you encounter issues not covered in this guide:

1. Check the troubleshooting section above
2. Review error messages carefully
3. Check server logs if self-hosting
4. Contact support with:
   - Description of the issue
   - Steps to reproduce
   - Error messages (if any)
   - Your project size and processing status

---

**Last Updated**: 2025-01-27

