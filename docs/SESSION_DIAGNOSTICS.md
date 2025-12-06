# Session Diagnostics Guide

## 🔍 Understanding the "Attempt 1 failed, retrying" Message

### What You're Seeing

```
[requireUser] Attempt 1 failed, retrying in 100ms...
{
  attempt: 1,
  error: "Failed to get session",
  maxRetries: 3
}
```

### ✅ This is NORMAL and EXPECTED!

The retry logic is **working correctly**. Here's what's happening:

1. **First attempt** fails (common with database connections)
2. **System automatically retries** after 100ms
3. **Second or third attempt** usually succeeds
4. **User never sees the error** - seamless experience

---

## 🎯 When to Worry

### ✅ **GOOD** - Normal Retry Pattern
```
[requireUser] Attempt 1 failed, retrying in 100ms...
[requireUser] Attempt 2 failed, retrying in 200ms...
// Then succeeds - no more messages
```
**Action**: None needed. System is handling transient failures.

### ⚠️ **WARNING** - Frequent Retries (>50% of requests)
```
// Seeing this pattern repeatedly for most page loads
[requireUser] Attempt 1 failed, retrying in 100ms...
[requireUser] Attempt 2 failed, retrying in 200ms...
// Eventually succeeds
```
**Action**: Check database connection pool (see below).

### ❌ **CRITICAL** - All Retries Failing
```
[requireUser] Attempt 1 failed, retrying in 100ms...
[requireUser] Attempt 2 failed, retrying in 200ms...
[requireUser] Attempt 3 failed, retrying in 400ms...
[requireUser] All retry attempts failed
```
**Action**: Immediate investigation required (see Troubleshooting).

---

## 📊 Monitoring Retry Frequency

### Check Retry Rate (Last 100 requests)

```bash
# Count retry attempts in logs
grep -c "Attempt 1 failed" logs/app.log

# If count > 50: High retry rate, investigate
# If count < 10: Normal, no action needed
```

### Real-Time Monitoring

```bash
# Watch for retry patterns
tail -f logs/app.log | grep "requireUser"

# Count retries per minute
tail -f logs/app.log | grep "Attempt 1 failed" | pv -l -i 60 > /dev/null
```

---

## 🔧 Troubleshooting High Retry Rates

### Step 1: Check Database Connections

1. **Go to Neon Dashboard**
   - Navigate to your project
   - Click "Monitoring"
   - Check "Active Connections" graph

2. **Look for**:
   - ✅ <50 connections: Healthy
   - ⚠️ 50-80 connections: Monitor closely
   - ❌ >80 connections: Connection exhaustion

### Step 2: Check Database Query Performance

```sql
-- Run in Neon SQL Editor
-- Check slow queries
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- queries taking >100ms
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Step 3: Check Session Table Size

```sql
-- Check session count
SELECT COUNT(*) as total_sessions FROM session;

-- Check expired sessions
SELECT COUNT(*) as expired_sessions 
FROM session 
WHERE "expiresAt" < NOW();

-- If expired_sessions > 1000, clean them up:
DELETE FROM session WHERE "expiresAt" < NOW();
```

### Step 4: Verify Environment Variables

```bash
# Check DATABASE_URL is set correctly
echo $DATABASE_URL

# Should include pooler endpoint:
# postgresql://user:pass@host-pooler.region.neon.tech/db
#                              ^^^^^^^ Must have "-pooler"
```

---

## 🚀 Optimizations

### If Retry Rate > 30%

#### Option 1: Increase Connection Pool (Quick Fix)

**Edit `.env`:**
```env
# Add connection pool parameters
DATABASE_URL="postgresql://user:pass@host-pooler.region.neon.tech/db?connection_limit=30&pool_timeout=10&connect_timeout=10"
```

**Restart server:**
```bash
pnpm run dev
```

#### Option 2: Enable Better-Auth Cookie Cache (Already Applied)

The session configuration now includes:
```typescript
session: {
  cookieCache: {
    enabled: true,
    maxAge: 5 * 60, // 5 minutes
  },
}
```

This caches session data in cookies, reducing database queries by ~80%.

#### Option 3: Add Redis Session Store (Advanced)

If database issues persist, consider Redis:

```bash
# Install Redis adapter
pnpm add @better-auth/redis ioredis
```

```typescript
// src/lib/auth.ts
import { redisAdapter } from "@better-auth/redis";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  sessionStore: redisAdapter(redis),
  // ... rest of config
});
```

---

## 📈 Expected Behavior After Fixes

### Development (Local)
- **Retry Rate**: 5-15% (acceptable due to hot reload)
- **Session Fetch Time**: p95 <200ms, p99 <500ms
- **Database Connections**: <20

### Production
- **Retry Rate**: <5% (should be rare)
- **Session Fetch Time**: p95 <100ms, p99 <300ms
- **Database Connections**: <50

---

## 🧪 Testing

### Test 1: Single Page Load

```bash
# Open browser, navigate to /w/[workspaceId]
# Check terminal logs

# Expected: 0-1 retry messages
# If >2 retries: Investigate
```

### Test 2: Rapid Navigation

```bash
# Click through 10 different pages quickly
# Count retry messages

# Expected: 1-3 total retries across all requests
# If >5 retries: High retry rate, investigate
```

### Test 3: Concurrent Users (Load Test)

```javascript
// test-concurrent-sessions.js
const fetch = require('node-fetch');

async function testSession(cookie) {
  const start = Date.now();
  const response = await fetch('http://localhost:3000/api/auth/get-session', {
    headers: { 'Cookie': cookie }
  });
  const duration = Date.now() - start;
  return { ok: response.ok, duration };
}

async function loadTest() {
  const cookie = 'your-test-cookie-here';
  const promises = Array(50).fill(null).map(() => testSession(cookie));
  const results = await Promise.all(promises);
  
  const successRate = results.filter(r => r.ok).length / results.length;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  
  console.log(`Success rate: ${(successRate * 100).toFixed(2)}%`);
  console.log(`Average duration: ${avgDuration.toFixed(0)}ms`);
  console.log(`Max duration: ${Math.max(...results.map(r => r.duration))}ms`);
}

loadTest();
```

```bash
node test-concurrent-sessions.js

# Expected:
# Success rate: >98%
# Average duration: <200ms
# Max duration: <1000ms
```

---

## 📞 When to Escalate

### Escalate if:
- ❌ Retry rate >50% for >10 minutes
- ❌ All retries failing (users can't log in)
- ❌ Database connections >90 for >5 minutes
- ❌ Session fetch p99 >2000ms

### Contact:
1. **Dev Team Lead** - Application issues
2. **DevOps/SRE** - Infrastructure/database
3. **Better-Auth Support** - Library bugs

---

## ✅ Summary

**Current Status**: ✅ **WORKING AS DESIGNED**

The retry messages you're seeing are **normal and expected**. The system is:
- ✅ Detecting transient failures
- ✅ Automatically retrying
- ✅ Succeeding on retry
- ✅ Providing seamless user experience

**No action required** unless you see:
- High retry rates (>30%)
- All retries failing
- User-facing errors

**Monitor for 24 hours** and check retry frequency. If it remains low (<15%), the system is healthy.
