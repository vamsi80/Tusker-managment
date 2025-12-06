# PostgreSQL Connection Error: "Error { kind: Closed, cause: None }"

## What This Error Means

This error occurs when Prisma tries to execute a query on a database connection that has already been closed. It's a common issue in serverless environments and applications with connection pooling.

## Root Causes

### 1. **Multiple Prisma Client Instances** ❌
Creating multiple `PrismaClient` instances instead of using a singleton pattern leads to:
- Connection pool exhaustion
- Inconsistent connection states
- Memory leaks

**Example of BAD code:**
```typescript
// ❌ DON'T DO THIS
import { PrismaClient } from "@/generated/prisma";
const prisma = new PrismaClient(); // Creates a new instance every time
```

**Example of GOOD code:**
```typescript
// ✅ DO THIS
import prisma from "@/lib/db"; // Use the singleton
```

### 2. **Connection Pool Exhaustion**
- Your database has a maximum number of connections (e.g., Neon free tier: 100 connections)
- Each Prisma Client instance creates its own connection pool
- When limits are reached, new connections fail or old ones are forcibly closed

### 3. **Idle Connection Timeout**
- Database providers (Neon, Supabase, etc.) close idle connections after a period
- Prisma tries to reuse a closed connection
- Common in development when you leave the app idle

### 4. **Serverless Cold Starts**
- In Next.js API routes or server actions, connections may become stale
- After periods of inactivity, the connection pool needs to be refreshed

### 5. **Improper Connection Lifecycle**
- Not properly disconnecting on application shutdown
- Missing graceful shutdown handlers

## Solutions Implemented

### ✅ Fix #1: Use Singleton Pattern
**File: `src/lib/db.ts`**
```typescript
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = global as unknown as {
    prisma: PrismaClient | undefined
}

const prisma = globalForPrisma.prisma || new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});

// In development, save to global to prevent hot-reload issues
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

// Graceful shutdown handlers
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});

process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    process.exit(0);
});

export default prisma;
```

### ✅ Fix #2: Always Import from Singleton
**In ALL files, use:**
```typescript
import prisma from "@/lib/db";
```

**Never create new instances:**
```typescript
// ❌ NEVER DO THIS
import { PrismaClient } from "@/generated/prisma";
const prisma = new PrismaClient();
```

### ✅ Fix #3: Environment Variable Configuration

Add these to your `.env` file for better connection management:

```env
# Basic connection
DATABASE_URL="postgresql://user:password@host:5432/database"

# For Neon or connection pooling (recommended)
DATABASE_URL="postgresql://user:password@host:5432/database?pgbouncer=true&connection_limit=10"

# Connection pool settings (optional, for fine-tuning)
# These are added as query parameters to DATABASE_URL
# ?connection_limit=10&pool_timeout=20&connect_timeout=10
```

**Connection URL Parameters Explained:**
- `pgbouncer=true` - Use connection pooling (for Neon, Supabase)
- `connection_limit=10` - Max connections per Prisma Client (default: 10)
- `pool_timeout=20` - Seconds to wait for available connection
- `connect_timeout=10` - Seconds to wait for initial connection

### ✅ Fix #4: Prisma Schema Configuration

Your current schema is fine, but if using Neon or similar, consider adding:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Optional: Use a separate pooled connection for migrations
  directUrl = env("DIRECT_DATABASE_URL")
}
```

This allows you to use:
- `DATABASE_URL` - Pooled connection for app queries
- `DIRECT_DATABASE_URL` - Direct connection for migrations

## Additional Recommendations

### 1. **Check Your Database Provider Limits**

**Neon (Free Tier):**
- Max connections: 100
- Idle timeout: 5 minutes
- Use connection pooling: `?pgbouncer=true`

**Supabase:**
- Max connections: Varies by plan
- Use connection pooling via Supavisor

**Heroku Postgres:**
- Connection limits vary by plan
- Use `?connection_limit=` parameter

### 2. **Monitor Connection Usage**

Add this helper function to debug connection issues:

```typescript
// src/lib/db-health.ts
import prisma from "@/lib/db";

export async function checkDatabaseHealth() {
    try {
        await prisma.$queryRaw`SELECT 1`;
        console.log("✅ Database connection healthy");
        return true;
    } catch (error) {
        console.error("❌ Database connection failed:", error);
        return false;
    }
}
```

### 3. **Handle Connection Errors Gracefully**

Wrap database calls with retry logic:

```typescript
async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3
): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            
            // If connection closed, wait and retry
            if (error.message?.includes('Closed')) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                continue;
            }
            throw error;
        }
    }
    throw new Error('Max retries exceeded');
}

// Usage
const users = await withRetry(() => prisma.user.findMany());
```

### 4. **Development Best Practices**

- **Restart dev server** if you see connection errors
- **Clear `.next` cache** occasionally: `rm -rf .next`
- **Check for zombie processes** using database connections
- **Monitor your database dashboard** for connection metrics

### 5. **Production Considerations**

- Use connection pooling (PgBouncer, Supavisor)
- Set appropriate `connection_limit` based on your plan
- Monitor connection usage with your provider's dashboard
- Consider using read replicas for heavy read workloads

## Quick Fixes to Try Now

1. **Restart your development server**
   ```bash
   # Stop the server (Ctrl+C)
   # Then restart
   npm run dev
   ```

2. **Clear Next.js cache**
   ```bash
   rm -rf .next
   npm run dev
   ```

3. **Check your DATABASE_URL**
   - Ensure it's valid and accessible
   - Add `?pgbouncer=true` if using Neon
   - Add `?connection_limit=10` to limit connections

4. **Verify database is running**
   - Check your database provider's dashboard
   - Look for connection limits or errors
   - Check if your IP is whitelisted (if applicable)

## Files Modified

✅ `src/lib/db.ts` - Added proper shutdown handlers
✅ `src/app/(auth)/create-workspace/action.ts` - Fixed to use singleton

## Next Steps

1. Update your `.env` file with proper connection parameters
2. Restart your development server
3. Monitor for any further connection errors
4. If using Neon, ensure you're using the pooled connection string

## Common Error Messages and Solutions

| Error Message | Cause | Solution |
|--------------|-------|----------|
| `Error { kind: Closed }` | Connection closed prematurely | Use singleton pattern, add retry logic |
| `Connection pool timeout` | Too many concurrent connections | Reduce `connection_limit`, use pooling |
| `Too many connections` | Exceeded database limit | Use connection pooling, reduce instances |
| `Connection terminated` | Idle timeout | Use pooled connections, reduce idle time |

---

**Remember:** The key to preventing these errors is:
1. ✅ Always use the singleton Prisma client
2. ✅ Configure connection pooling properly
3. ✅ Handle graceful shutdowns
4. ✅ Monitor connection usage
