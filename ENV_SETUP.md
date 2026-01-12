# Environment Variables Setup

## Quick Answer

**You only NEED to set one variable:**
- ✅ `ANTHROPIC_API_KEY` - **REQUIRED** (you already have this set!)

All other variables have defaults and are optional.

---

## Your Current .env File

You currently have:
```
ANTHROPIC_API_KEY=sk-ant-... (✅ Set - this is the only required one!)
AITABLE_API_KEY=... (⚠️ Not used in this project - can be removed)
```

---

## Required Variables

### ANTHROPIC_API_KEY
- **Status:** ✅ **REQUIRED** (you have this!)
- **Description:** Your Claude API key from Anthropic
- **Format:** Must start with `sk-ant-`
- **Where to get:** https://console.anthropic.com/
- **Current value:** ✅ Already set in your `.env`

---

## Optional Variables (All have defaults)

These will use default values if not set:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port number |
| `NODE_ENV` | `development` | Environment mode |
| `EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` | Local embedding model |
| `DATA_DIR` | `./data/projects` | Where databases are stored |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `MAX_FILE_SIZE_MB` | `10` | Maximum upload file size |
| `CLAUDE_RATE_LIMIT_DELAY_MS` | `150` | Delay between Claude API calls |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS allowed origins |
| `JWT_SECRET` | `change-me-in-production` | Secret for JWT tokens |
| `JWT_EXPIRY` | `7d` | JWT token expiration |

---

## Recommended .env File

For **development**, you can use:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional (but recommended for development)
LOG_LEVEL=debug
NODE_ENV=development
```

**That's it!** All other values will use their defaults.

---

## For Production

In production, you should set:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-your-production-key

# Recommended for production
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
DATA_DIR=/var/data/trendfinder/projects
JWT_SECRET=your-very-secure-random-secret-key-here
ALLOWED_ORIGINS=https://yourdomain.com
MAX_FILE_SIZE_MB=10
```

---

## Clean Up Your Current .env

You can update your `.env` file to remove the unused `AITABLE_API_KEY`:

```bash
# Remove this line (not used in TrendFinder):
AITABLE_API_KEY=uskcecf9h2l2XpXiPXFCpJ

# Keep or add:
ANTHROPIC_API_KEY=sk-ant-... (your existing key)
```

---

## Summary

✅ **You're good to go!** You have the only required variable (`ANTHROPIC_API_KEY`) set.

You can:
1. Leave it as-is (it will work!)
2. Remove `AITABLE_API_KEY` (not used)
3. Optionally add other variables if you want to customize defaults

The application will work with just `ANTHROPIC_API_KEY` set! 🎉


