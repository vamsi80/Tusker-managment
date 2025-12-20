# 🔄 Migrating from Neon to Supabase

This guide will walk you through the complete process of migrating your Tusker Management application from Neon PostgreSQL to Supabase.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Why Migrate to Supabase?](#why-migrate-to-supabase)
3. [Migration Steps](#migration-steps)
4. [Post-Migration Tasks](#post-migration-tasks)
5. [Rollback Plan](#rollback-plan)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting the migration, ensure you have:

- ✅ A Supabase account (free tier available at https://supabase.com)
- ✅ Access to your current Neon database
- ✅ Backup of your current database (see Step 1)
- ✅ Local development environment set up
- ✅ Git repository with all changes committed

---

## Why Migrate to Supabase?

### Supabase Advantages:

1. **No Cold Starts**: Unlike Neon free tier, Supabase doesn't put databases to sleep
2. **Built-in Features**: 
   - Real-time subscriptions
   - Row Level Security (RLS)
   - Built-in authentication (optional, you're using Better Auth)
   - Storage for files
   - Edge Functions
3. **Better Free Tier**: 
   - 500MB database (vs Neon's 512MB)
   - Unlimited API requests
   - 2GB file storage
   - 50MB file uploads
4. **Dashboard**: More comprehensive database management tools
5. **Connection Pooling**: Built-in PgBouncer (similar to Neon)

---

## Migration Steps

### Step 1: Backup Your Current Neon Database

**Option A: Using pg_dump (Recommended)**

```powershell
# Install PostgreSQL tools if not already installed
# Download from: https://www.postgresql.org/download/windows/

# Create backup directory
New-Item -ItemType Directory -Force -Path ".\database-backups"

# Export your database
$env:PGPASSWORD="npg_Hmaq3Jp4Ilew"
pg_dump -h ep-dark-bar-a4zvmbg9.us-east-1.aws.neon.tech -U neondb_owner -d neondb -F c -f ".\database-backups\neon-backup-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').dump"
```

**Option B: Using Neon Dashboard**

1. Go to https://console.neon.tech
2. Select your project
3. Navigate to "Backups" section
4. Create a manual backup

---

### Step 2: Create a New Supabase Project

1. **Sign up/Login to Supabase**
   - Go to https://supabase.com
   - Click "Start your project"

2. **Create New Project**
   - Click "New Project"
   - Choose your organization (or create one)
   - Fill in project details:
     - **Name**: `tusker-management` (or your preferred name)
     - **Database Password**: Generate a strong password (SAVE THIS!)
     - **Region**: Choose closest to your users (e.g., `us-east-1`)
     - **Pricing Plan**: Free (or Pro if needed)

3. **Wait for Project Setup** (takes 1-2 minutes)

---

### Step 3: Get Supabase Connection Strings

Once your project is ready:

1. Go to **Project Settings** (gear icon in sidebar)
2. Navigate to **Database** section
3. Scroll to **Connection String** section
4. You'll need TWO connection strings:

   **A. Connection Pooling (for DATABASE_URL)**
   - Mode: `Transaction`
   - Copy the connection string that looks like:
   ```
   postgresql://postgres.xxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```

   **B. Direct Connection (for DIRECT_URL)**
   - Mode: `Session`
   - Copy the connection string that looks like:
   ```
   postgresql://postgres.xxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.compute.amazonaws.com:5432/postgres
   ```

5. **Replace `[YOUR-PASSWORD]`** in both URLs with your actual database password

---

### Step 4: Update Environment Variables

Update your `.env` file with the new Supabase connection strings:

```env
# OLD Neon URLs (comment out or remove)
# DIRECT_URL = "postgresql://neondb_owner:npg_Hmaq3Jp4Ilew@ep-dark-bar-a4zvmbg9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
# DATABASE_URL = "postgresql://neondb_owner:npg_Hmaq3Jp4Ilew@ep-dark-bar-a4zvmbg9-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# NEW Supabase URLs
DIRECT_URL="postgresql://postgres.xxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.compute.amazonaws.com:5432/postgres"
DATABASE_URL="postgresql://postgres.xxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
```

**Important Notes:**
- The pooler URL (port 6543) is for `DATABASE_URL`
- The direct URL (port 5432) is for `DIRECT_URL`
- Keep `sslmode=require` if you want (Supabase supports it)

---

### Step 5: Push Prisma Schema to Supabase

Now we'll create all your tables in the new Supabase database:

```powershell
# Navigate to your project directory
cd c:\VamsiKrishna\Github\Tusker-managment

# Generate Prisma Client with new connection
pnpm prisma generate

# Push schema to Supabase (creates all tables)
pnpm prisma db push

# Verify the migration
pnpm prisma studio
```

This will:
- Create all tables defined in your `schema.prisma`
- Create all indexes
- Set up all relationships

---

### Step 6: Migrate Your Data

**Option A: Using pg_dump/pg_restore (Recommended for large datasets)**

```powershell
# Restore from backup to Supabase
$env:PGPASSWORD="[YOUR-SUPABASE-PASSWORD]"
pg_restore -h aws-0-us-east-1.compute.amazonaws.com -U postgres.xxxxxxxxxxxxx -d postgres -c --if-exists ".\database-backups\neon-backup-*.dump"
```

**Option B: Using Prisma Studio (Good for small datasets)**

1. Open two Prisma Studio instances:
   ```powershell
   # Terminal 1 - Connected to Neon (temporarily change .env back)
   pnpm prisma studio
   
   # Terminal 2 - Connected to Supabase (with new .env)
   pnpm prisma studio
   ```

2. Manually copy data table by table (tedious but works for small datasets)

**Option C: Using Supabase SQL Editor**

1. Export data from Neon as SQL:
   ```powershell
   $env:PGPASSWORD="npg_Hmaq3Jp4Ilew"
   pg_dump -h ep-dark-bar-a4zvmbg9.us-east-1.aws.neon.tech -U neondb_owner -d neondb --data-only --inserts -f ".\database-backups\data-only.sql"
   ```

2. Go to Supabase Dashboard → SQL Editor
3. Paste and run the SQL file content

---

### Step 7: Verify Data Migration

Run these checks to ensure everything migrated correctly:

```powershell
# Connect to Supabase and check record counts
pnpm prisma studio
```

**Verification Checklist:**

```sql
-- Run these in Supabase SQL Editor to verify counts match Neon

SELECT 'users' as table_name, COUNT(*) as count FROM "user"
UNION ALL
SELECT 'workspaces', COUNT(*) FROM "Workspace"
UNION ALL
SELECT 'projects', COUNT(*) FROM "Project"
UNION ALL
SELECT 'tasks', COUNT(*) FROM "Task"
UNION ALL
SELECT 'workspace_members', COUNT(*) FROM "WorkspaceMember"
UNION ALL
SELECT 'project_members', COUNT(*) FROM "ProjectMember"
UNION ALL
SELECT 'comments', COUNT(*) FROM "comment"
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM "audit_log";
```

Compare these counts with your Neon database.

---

### Step 8: Test Your Application Locally

```powershell
# Clear Next.js cache
Remove-Item -Recurse -Force .next

# Regenerate Prisma Client
pnpm prisma generate

# Start development server
pnpm dev
```

**Test these critical features:**

- ✅ User authentication (login/logout)
- ✅ Workspace creation and access
- ✅ Project creation and management
- ✅ Task creation, updates, and deletion
- ✅ Kanban board functionality
- ✅ Task table with filters
- ✅ Gantt chart view
- ✅ Comments system
- ✅ File uploads (if using)
- ✅ Audit logs

---

### Step 9: Update Documentation

Update any documentation that references Neon:

1. **Update `docs/HOW_TO_CHECK_ADD_INDEXES.md`**
   - Replace Neon dashboard references with Supabase
   - Update SQL editor instructions

2. **Update `docs/OPTIMIZE_SERVER_RESPONSE_100MS.md`**
   - Remove Neon cold start references
   - Update connection pooling docs

3. **Update `scripts/diagnose-db-connection.ts`**
   - Update connection string examples

---

### Step 10: Deploy to Production

**If using Vercel:**

1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Update:
   - `DATABASE_URL` → New Supabase pooler URL
   - `DIRECT_URL` → New Supabase direct URL
4. Redeploy your application

**If using other platforms:**

Update environment variables in your hosting platform and redeploy.

---

### Step 11: Remove Keep-Warm Cron Job (Optional)

Since Supabase doesn't have cold starts, you can remove the keep-warm cron job:

**Option A: Keep it (harmless)**
- The cron job won't hurt anything

**Option B: Remove it**
1. Delete or comment out `src/app/api/cron/keep-warm/route.ts`
2. Remove any cron job configurations from your hosting platform

---

## Post-Migration Tasks

### 1. Monitor Performance

For the first few days after migration:

- Monitor response times in Supabase Dashboard
- Check for any slow queries
- Review connection pool usage

### 2. Set Up Supabase Features (Optional)

**Enable Row Level Security (RLS):**
```sql
-- Example: Enable RLS on Task table
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;

-- Create policies as needed
CREATE POLICY "Users can view their workspace tasks"
ON "Task"
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM "WorkspaceMember" wm
    JOIN "Project" p ON p."workspaceId" = wm."workspaceId"
    WHERE wm."userId" = auth.uid()
    AND p.id = "Task"."projectId"
  )
);
```

**Set Up Database Backups:**
- Supabase Pro includes daily backups
- Free tier: Use `pg_dump` scheduled via GitHub Actions

### 3. Update Connection Pool Settings

If you experience connection issues, adjust in Supabase Dashboard:

1. Go to **Database** → **Connection Pooling**
2. Adjust pool size (default is usually fine)
3. Set timeout values

---

## Rollback Plan

If something goes wrong, you can quickly rollback:

### Quick Rollback Steps:

1. **Revert `.env` file:**
   ```env
   # Restore Neon URLs
   DIRECT_URL = "postgresql://neondb_owner:npg_Hmaq3Jp4Ilew@ep-dark-bar-a4zvmbg9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
   DATABASE_URL = "postgresql://neondb_owner:npg_Hmaq3Jp4Ilew@ep-dark-bar-a4zvmbg9-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
   ```

2. **Regenerate Prisma Client:**
   ```powershell
   pnpm prisma generate
   ```

3. **Restart development server:**
   ```powershell
   pnpm dev
   ```

4. **For production:** Revert environment variables in Vercel/hosting platform

---

## Troubleshooting

### Issue: "Can't reach database server"

**Solution:**
- Check if Supabase project is active (Dashboard → Project Settings)
- Verify connection strings are correct
- Ensure password is URL-encoded if it contains special characters

### Issue: "Too many connections"

**Solution:**
- Use the pooler URL (port 6543) for `DATABASE_URL`
- Reduce connection pool size in Prisma:
  ```prisma
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DIRECT_URL")
    // Add this:
    // relationMode = "prisma"
  }
  ```

### Issue: "SSL connection required"

**Solution:**
Add `?sslmode=require` to your connection strings:
```
postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require
```

### Issue: "Schema migration failed"

**Solution:**
1. Drop all tables in Supabase (SQL Editor):
   ```sql
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   GRANT ALL ON SCHEMA public TO postgres;
   GRANT ALL ON SCHEMA public TO public;
   ```
2. Re-run `pnpm prisma db push`

### Issue: "Data types don't match"

**Solution:**
- Ensure you're using the same Prisma version
- Check that `@prisma/client` version matches `prisma` version in package.json

---

## Comparison: Neon vs Supabase

| Feature | Neon (Current) | Supabase (New) |
|---------|---------------|----------------|
| **Cold Starts** | Yes (free tier) | No |
| **Connection Pooling** | Yes (PgBouncer) | Yes (PgBouncer) |
| **Free Tier Database** | 512MB | 500MB |
| **Free Tier Compute** | Limited | Unlimited |
| **Dashboard** | Basic | Comprehensive |
| **Additional Features** | None | Auth, Storage, Realtime, Edge Functions |
| **Pricing (Paid)** | $19/mo | $25/mo |
| **Backups (Free)** | Manual | Point-in-time recovery (7 days) |

---

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Database Guide](https://supabase.com/docs/guides/database)
- [Prisma with Supabase](https://www.prisma.io/docs/guides/database/supabase)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)

---

## Support

If you encounter issues during migration:

1. Check Supabase Status: https://status.supabase.com
2. Supabase Discord: https://discord.supabase.com
3. Supabase GitHub Discussions: https://github.com/supabase/supabase/discussions

---

## Summary

**Total Migration Time:** ~30-60 minutes (depending on data size)

**Key Steps:**
1. ✅ Backup Neon database
2. ✅ Create Supabase project
3. ✅ Update environment variables
4. ✅ Push Prisma schema
5. ✅ Migrate data
6. ✅ Test thoroughly
7. ✅ Deploy to production

**Post-Migration:**
- No more cold starts! 🎉
- Better dashboard and monitoring
- Optional: Explore Supabase features (RLS, Realtime, Storage)

---

**Good luck with your migration! 🚀**
