# TrendFinder

A web application that helps you identify trends from scan hits (signals) using AI-powered semantic analysis. TrendFinder uses a hybrid approach combining local embeddings with Claude AI verification to achieve high-quality results at ~99% cost reduction compared to naive approaches.

## Features

- 📊 **Upload & Process**: Import signals from Excel or CSV files
- 🤖 **AI-Powered Analysis**: Local embeddings + Claude AI verification for accurate similarity detection
- 📈 **Trend Identification**: Group related signals into trends with AI-generated summaries
- 💾 **Export Data**: Export trends and signals as CSV for further analysis
- 🔐 **Multi-User Support**: Secure authentication and project isolation
- ⚡ **Fast Processing**: Parallel processing with configurable concurrency
- 💰 **Cost-Effective**: ~$6.50 for 500 signals (one-time processing cost)

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Anthropic API key (for Claude AI)
- SQLite (included with better-sqlite3)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd TrendFinder
   ```

2. **Install dependencies**
   ```bash
   # Backend
   cd server
   npm install
   
   # Frontend
   cd ../client
   npm install
   ```

3. **Configure environment**
   ```bash
   # Copy example env file
   cp .env.example .env
   
   # Edit .env and add your ANTHROPIC_API_KEY
   ```

4. **Start the application**
   ```bash
   # Terminal 1: Start backend
   cd server
   npm run dev
   
   # Terminal 2: Start frontend
   cd client
   npm run dev
   ```

5. **Access the application**
   - Open http://localhost:5173 in your browser
   - Register a new account or log in

## Documentation

- **[User Guide](USER_GUIDE.md)** - Comprehensive guide for using TrendFinder
- **[Cost Estimation Guide](COST_ESTIMATION.md)** - Understand and estimate API costs
- **[Environment Setup](ENV_SETUP.md)** - Detailed environment configuration
- **[Security Notes](SECURITY_NOTES.md)** - Security considerations and best practices

## Architecture

TrendFinder uses a hybrid AI approach:

1. **Local Embeddings** (Phase 1): Fast, free semantic analysis using local models
2. **Similarity Calculation** (Phase 2): Mathematical similarity scoring
3. **Claude Verification** (Phase 3): AI verification of top candidates for quality assurance

This approach provides near-Claude quality at ~99% cost reduction.

## Technology Stack

- **Backend**: Node.js, Express, TypeScript, SQLite
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **AI**: Xenova Transformers (local), Anthropic Claude API
- **Authentication**: JWT with HTTP-only cookies

## Project Structure

```
TrendFinder/
├── server/          # Backend API
│   ├── src/
│   │   ├── routes/     # API routes
│   │   ├── services/    # Business logic
│   │   ├── config/      # Configuration
│   │   └── middleware/  # Auth, security, etc.
│   └── package.json
├── client/          # Frontend React app
│   ├── src/
│   │   ├── pages/       # Page components
│   │   ├── components/   # Reusable components
│   │   ├── hooks/        # Custom React hooks
│   │   └── services/    # API client
│   └── package.json
└── README.md
```

## Cost Estimates

| Project Size | Estimated Cost |
|--------------|----------------|
| 100 signals  | ~$1.31         |
| 250 signals  | ~$3.28         |
| 500 signals  | ~$6.55         |
| 1,000 signals| ~$13.10        |

*Costs include signal verification and trend summaries. See [Cost Estimation Guide](COST_ESTIMATION.md) for details.*

## License

See [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or contributions, please refer to the documentation or open an issue in the repository. 
