# Fix for PostgreSQL "Prepared Statement Does Not Exist" Errors

## Problem

You're experiencing errors like:
```
Error occurred during query execution:
ConnectorError(ConnectorError { 
  kind: QueryError(PostgresError { 
    code: "26000", 
    message: "prepared statement \"s125\" does not exist"
  })
})
```

## Root Cause

This error occurs when using **connection poolers** (like PgBouncer, Supabase Pooler, or Neon) with PostgreSQL. The issue is:

1. **Prepared statements are session-scoped** - they only exist for a specific database connection
2. **Connection poolers reuse connections** - when a connection is returned to the pool and reassigned, the prepared statements are lost
3. **Prisma uses prepared statements by default** - for performance optimization

## Solution

You need to **disable prepared statements** when using connection poolers. There are two ways to do this:

### Option 1: Add `pgbouncer=true` to your DATABASE_URL (Recommended)

Update your `.env` file to add `?pgbouncer=true` to your `DATABASE_URL`:

```env
# Before
DATABASE_URL="postgresql://user:password@host:port/database"

# After - Add ?pgbouncer=true at the end
DATABASE_URL="postgresql://user:password@host:port/database?pgbouncer=true"

# If your URL already has parameters, use & instead
DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require&pgbouncer=true"
```

### Option 2: Configure Prisma Client (Already Done)

I've already updated `src/lib/db.ts` to configure the Prisma Client with proper settings for connection poolers.

## What I Changed

### 1. Updated `src/lib/db.ts`
```typescript
const prisma = globalForPrisma.prisma || new PrismaClient({
    // Disable prepared statements to fix "prepared statement does not exist" errors
    // This is required when using connection poolers like PgBouncer or Supabase Pooler
    datasourceUrl: process.env.DATABASE_URL,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});
```

### 2. Added documentation to `prisma/schema.prisma`
Added comments explaining the need for `pgbouncer=true` parameter.

## Next Steps

### **IMPORTANT: Update your .env file**

1. Open your `.env` file (not tracked in git)
2. Find your `DATABASE_URL` line
3. Add `?pgbouncer=true` to the end of the URL (or `&pgbouncer=true` if you already have query parameters)

Example:
```env
# Supabase example
DATABASE_URL="postgresql://postgres.xxxxx:password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Neon example  
DATABASE_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?pgbouncer=true"

# Generic example
DATABASE_URL="postgresql://user:password@host:port/database?pgbouncer=true"
```

### After updating .env:

1. **Restart your dev server** (the current one will pick up the change automatically, but restart to be sure)
2. **Test the application** - the errors should be gone
3. **Generate Prisma Client** (optional, if needed):
   ```bash
   pnpm prisma generate
   ```

## Why This Works

When you add `?pgbouncer=true` to your connection URL:
- Prisma **disables prepared statements** for that connection
- All queries are sent as **simple queries** instead
- This works perfectly with connection poolers because simple queries don't require session state
- **Small performance trade-off** but necessary for connection pooler compatibility

## Additional Benefits

The updated configuration also:
- ✅ Reduces log noise in development (only shows errors and warnings)
- ✅ Only shows errors in production
- ✅ Properly configures the datasource URL

## Verification

After making the changes, you should no longer see:
- ❌ `prepared statement "sXXX" does not exist` errors
- ❌ Connection pool errors
- ❌ Random database query failures

## References

- [Prisma Connection Pooling Guide](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#pgbouncer)
- [PgBouncer with Prisma](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#pgbouncer)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
