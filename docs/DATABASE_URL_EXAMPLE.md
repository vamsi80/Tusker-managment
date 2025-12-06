# ============================================
# DATABASE CONNECTION (NEON) - EXAMPLE
# ============================================

# ✅ CORRECT FORMAT FOR NEON (with connection pooling)
# Use the -pooler endpoint from Neon dashboard
# Add these parameters: pgbouncer=true, connection_limit=10, pool_timeout=20, connect_timeout=10
# REMOVE: channel_binding=require (not compatible with pgbouncer)

DATABASE_URL="postgresql://neondb_owner:YOUR_PASSWORD@ep-your-project-pooler.region.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=10&pool_timeout=20&connect_timeout=10"

# ❌ WRONG FORMAT (causes "Connection Closed" errors)
# DATABASE_URL="postgresql://neondb_owner:YOUR_PASSWORD@ep-your-project-pooler.region.neon.tech/neondb?sslmode=require&channel_binding=require"

# ============================================
# IMPORTANT NOTES
# ============================================

# 1. DATABASE_URL MUST include these parameters for Neon:
#    - pgbouncer=true (enables connection pooling)
#    - connection_limit=10 (prevents hitting 100 connection limit)
#    - pool_timeout=20 (wait time for available connection)
#    - connect_timeout=10 (connection timeout)

# 2. DO NOT include channel_binding=require with pgbouncer=true

# 3. Use the -pooler endpoint from Neon, not the direct endpoint

# 4. For production, consider increasing connection_limit if on paid plan

# 5. Monitor connections at: https://console.neon.tech
