# Security Notes

## Known Vulnerabilities

### xlsx Package (High Severity) - ✅ RESOLVED

**Status:** Fixed - Replaced with secure alternative

**Original Vulnerabilities:**
- Prototype Pollution (GHSA-4r6h-8v6p-xvw6)
- Regular Expression Denial of Service (ReDoS) (GHSA-5pgg-2g8v-p4x9)

**Resolution:**
- ✅ Replaced `xlsx` with `@e965/xlsx` (secure, maintained fork)
- ✅ Same API - drop-in replacement, no code changes needed
- ✅ All vulnerabilities resolved
- ✅ Verified with `npm audit` - 0 vulnerabilities found

**Package Details:**
- **Old:** `xlsx@^0.18.5` (vulnerable, unmaintained)
- **New:** `@e965/xlsx@^0.20.3` (secure, actively maintained)

**References:**
- https://github.com/advisories/GHSA-4r6h-8v6p-xvw6
- https://github.com/advisories/GHSA-5pgg-2g8v-p4x9
- https://www.npmjs.com/package/@e965/xlsx

---

## Other Security Considerations

### multer Package (Deprecated)

**Status:** Warning - Consider upgrade in Phase 4

**Issue:** Multer 1.x has known vulnerabilities, 2.x has patches

**Action:** Upgrade to multer 2.x when implementing file upload middleware (Phase 4)

---

## Security Best Practices

1. **Environment Variables:**
   - Never commit `.env` files
   - Use strong JWT_SECRET in production
   - Rotate API keys regularly

2. **Input Validation:**
   - All user inputs validated with Zod schemas
   - SQL injection prevention via parameterized queries
   - Path traversal prevention in file operations

3. **Authentication:**
   - JWT tokens in HTTP-only cookies
   - Password hashing with bcryptjs (10 rounds)
   - Role-based access control (RBAC)

4. **Database:**
   - SQLite with WAL mode for better concurrency
   - Foreign key constraints enabled
   - Prepared statements for all queries

---

## Update Log

- **2024-01-11:** Documented xlsx vulnerabilities - to be addressed in Phase 3
- **2024-01-11:** Noted multer deprecation warning

