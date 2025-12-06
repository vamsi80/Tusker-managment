# Session Failure Runbook

## 🚨 Quick Reference

**Symptom**: Users see "fail to load sessions" or get redirected to sign-in unexpectedly  
**Root Cause**: Database connection exhaustion + missing error handling  
**Severity**: P1 (Blocks user access)  
**MTTR**: 5-10 minutes

---

## 📊 Monitoring & Detection

### Key Metrics to Watch

1. **Session Fetch Success Rate**
   - Target: >99.9%
   - Alert if: <98% over 5 minutes
   - Check: Application logs for `[requireUser]` and `[authMiddleware]` errors

2. **Database Connection Pool**
   - Target: <80% utilization
   - Alert if: >90% for 2 minutes
   - Check: Neon dashboard → Connection pooler metrics

3. **Session Fetch Latency**
   - Target: p95 <200ms, p99 <500ms
   - Alert if: p99 >1000ms
   - Check: Application logs for retry attempts

### Log Queries

```bash
# Check for session failures (last 1 hour)
grep -i "session fetch failed" logs/*.log | tail -50

# Check retry patterns
grep -i "retrying in" logs/*.log | wc -l

# Check connection errors
grep -i "connection" logs/*.log | grep -i "error"
```

---

## 🔍 Diagnosis Steps

### Step 1: Check Application Logs

```bash
# Look for session errors
tail -f logs/app.log | grep -i "session"

# Expected patterns:
# ✅ Normal: No errors
# ⚠️  Warning: "[requireUser] Attempt 1 failed, retrying..."
# ❌ Critical: "[requireUser] All retry attempts failed"
```

### Step 2: Check Database Connections

1. Go to Neon Dashboard
2. Navigate to your project → Monitoring
3. Check "Active Connections" graph
4. If >90 connections: **Connection exhaustion confirmed**

### Step 3: Check Better-Auth Session Table

```sql
-- Check session count
SELECT COUNT(*) FROM session;

-- Check for expired sessions
SELECT COUNT(*) FROM session WHERE "expiresAt" < NOW();

-- Check session age distribution
SELECT 
  CASE 
    WHEN "expiresAt" < NOW() THEN 'expired'
    WHEN "expiresAt" < NOW() + INTERVAL '1 hour' THEN 'expiring_soon'
    ELSE 'active'
  END as status,
  COUNT(*)
FROM session
GROUP BY status;
```

---

## 🔧 Immediate Fixes

### Fix 1: Restart Application (Quick Fix - 2 min)

```bash
# Development
pnpm run dev

# Production (if using PM2)
pm2 restart app

# Production (if using Docker)
docker-compose restart app

# Production (if using Vercel/Platform)
# Trigger redeployment from dashboard
```

**Expected Result**: Clears stuck connections, resets connection pool

### Fix 2: Clear Expired Sessions (5 min)

```sql
-- Run in Neon SQL Editor
DELETE FROM session WHERE "expiresAt" < NOW();
```

**Expected Result**: Reduces session table size, improves query performance

### Fix 3: Increase Connection Pool (if needed)

**Edit `.env`:**
```env
# Add connection pool parameters to DATABASE_URL
DATABASE_URL="postgresql://user:pass@host/db?connection_limit=20&pool_timeout=10"
```

**Expected Result**: More connections available for session checks

---

## 🛠️ Applied Fixes (Permanent)

### ✅ Fix 1: Retry Logic with Exponential Backoff

**File**: `src/app/data/user/require-user.ts`

**What it does**:
- Retries session fetch up to 3 times
- Uses exponential backoff (100ms → 200ms → 400ms)
- Logs all failures for debugging
- Gracefully falls back to sign-in

**Rollback**:
```bash
git revert <commit-hash>
```

### ✅ Fix 2: Middleware Error Handling

**File**: `middleware.ts`

**What it does**:
- Retries session fetch in middleware
- Adds detailed error logging
- Prevents silent failures
- Adds error context to redirects

**Rollback**:
```bash
git revert <commit-hash>
```

### ✅ Fix 3: Prisma Connection Pool Configuration

**File**: `src/lib/db.ts`

**What it does**:
- Configures Prisma logging
- Adds graceful shutdown
- Prevents connection leaks

**Rollback**:
```bash
git revert <commit-hash>
```

---

## 🔄 Rollback Procedure

### If Issues Persist After Fixes

1. **Rollback Code Changes**
   ```bash
   git log --oneline -10  # Find commit hashes
   git revert <commit-hash-1> <commit-hash-2> <commit-hash-3>
   git push
   ```

2. **Restart Application**
   ```bash
   # Clear all caches
   rm -rf .next
   pnpm run build
   pnpm run start
   ```

3. **Monitor for 15 minutes**
   - Check error logs
   - Verify session success rate
   - Check database connections

---

## 📈 Post-Incident Actions

### Immediate (Within 1 hour)

- [ ] Verify session success rate >99%
- [ ] Check database connection count <50
- [ ] Review error logs for new patterns
- [ ] Update incident log with timeline

### Short-term (Within 1 day)

- [ ] Add session metrics to monitoring dashboard
- [ ] Set up alerts for session failures
- [ ] Document any new error patterns
- [ ] Share runbook with team

### Long-term (Within 1 week)

- [ ] Consider Redis for session storage (if DB issues persist)
- [ ] Implement session caching layer
- [ ] Add distributed tracing (OpenTelemetry)
- [ ] Load test session endpoints

---

## 🧪 Testing the Fix

### Local Testing

```bash
# 1. Start application
pnpm run dev

# 2. Run load test (simulate 100 concurrent users)
# Create test-session-load.js:
```

```javascript
// test-session-load.js
const fetch = require('node-fetch');

async function testSession() {
  const response = await fetch('http://localhost:3000/api/auth/get-session', {
    headers: { 'Cookie': 'your-test-cookie' }
  });
  return response.ok;
}

async function loadTest() {
  const promises = Array(100).fill(null).map(() => testSession());
  const results = await Promise.all(promises);
  const successRate = results.filter(r => r).length / results.length;
  console.log(`Success rate: ${(successRate * 100).toFixed(2)}%`);
}

loadTest();
```

```bash
# 3. Run test
node test-session-load.js

# Expected: >99% success rate
```

### Staging Testing

1. Deploy to staging
2. Run automated E2E tests
3. Monitor for 1 hour
4. Check error logs
5. Verify metrics

---

## 📞 Escalation

### If Issue Persists After All Fixes

**Level 1**: Application Team  
- Check: Application logs, code changes  
- Contact: Dev team lead  

**Level 2**: Infrastructure Team  
- Check: Database connections, network  
- Contact: DevOps/SRE  

**Level 3**: Database Team  
- Check: Neon pooler, query performance  
- Contact: Database admin  

**Level 4**: Better-Auth Support  
- Check: Library bugs, configuration  
- Contact: https://github.com/better-auth/better-auth/issues  

---

## 📝 Change Log

| Date | Change | Author | Reason |
|------|--------|--------|--------|
| 2025-12-06 | Added retry logic | System | Fix session failures |
| 2025-12-06 | Added error handling | System | Improve debugging |
| 2025-12-06 | Configured connection pool | System | Prevent exhaustion |

---

## 🔗 Related Documentation

- [Better-Auth Docs](https://www.better-auth.com/docs)
- [Neon Connection Pooling](https://neon.tech/docs/connect/connection-pooling)
- [Prisma Connection Pool](https://www.prisma.io/docs/concepts/components/prisma-client/working-with-prismaclient/connection-pool)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)
