# 🚀 Redis Integration Guide for Tusker Management

This comprehensive document analyzes the Tusker Management project architecture and provides a detailed guide for integrating Redis to enhance performance, enable real-time features, and scale the application.

---

## 📊 Project Analysis Summary

### Current Architecture

| Component | Technology | Current State |
|-----------|------------|---------------|
| **Framework** | Next.js 15.5 (App Router + Turbopack) | ✅ Production-ready |
| **Database** | PostgreSQL (Prisma ORM) | ✅ Fully optimized with indexes |
| **Caching (L2)** | React `cache()` | ✅ Request deduplication |
| **Caching (L3)** | `unstable_cache` | ✅ Cross-request caching |
| **Real-time** | Not implemented | ❌ Opportunity for Redis |
| **Session Store** | Database (better-auth) | ⚠️ Could use Redis |
| **Rate Limiting** | Arcjet | ✅ In use |
| **Message Queue** | Not implemented | ❌ Opportunity for Redis |

### Key Features That Would Benefit from Redis

1. **Real-time Kanban Updates** - Notify users when cards move
2. **User Presence** - Show who's viewing a task/project
3. **Session Management** - Faster session lookups
4. **Rate Limiting** - Distributed rate limiting (currently Arcjet)
5. **Job Queues** - Background tasks (email, notifications)
6. **Distributed Locks** - Prevent race conditions on concurrent edits
7. **Leaderboards/Analytics** - Real-time task completion stats

---

## 🏗️ Recommended Redis Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TUSKER MANAGEMENT                            │
│                                                                     │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────────────────┐ │
│  │   Next.js   │    │   Redis      │    │      PostgreSQL        │ │
│  │   Server    │◄──►│   (Upstash)  │◄──►│   (Supabase)           │ │
│  │             │    │              │    │                        │ │
│  │ - API Routes│    │ - Sessions   │    │ - Tasks                │ │
│  │ - Actions   │    │ - Presence   │    │ - Projects             │ │
│  │ - RSC       │    │ - Pub/Sub    │    │ - Users                │ │
│  │             │    │ - Queues     │    │ - Audit Logs           │ │
│  └─────────────┘    │ - Locks      │    └────────────────────────┘ │
│                     │ - Cache      │                               │
│                     └──────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Installation

### Step 1: Install Redis Packages

```bash
pnpm add @upstash/redis @upstash/ratelimit ioredis bullmq
```

### Step 2: Add Environment Variables

```env
# .env
# Upstash Redis (recommended for serverless)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# OR Traditional Redis (for VPS/Docker)
REDIS_URL=redis://localhost:6379
```

### Step 3: Create Redis Client

Create `src/lib/redis.ts`:

```typescript
// src/lib/redis.ts
import { Redis } from "@upstash/redis";

// Singleton pattern for Redis client
const globalForRedis = global as unknown as {
    redis: Redis | undefined;
};

export const redis =
    globalForRedis.redis ||
    new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

if (process.env.NODE_ENV !== "production") {
    globalForRedis.redis = redis;
}

export default redis;
```

---

## 🎯 Use Case 1: Real-time Kanban Updates

### Problem
Currently, when User A moves a card, User B doesn't see the update until they refresh.

### Solution: Redis Pub/Sub + Server-Sent Events (SSE)

#### Step 1: Create Pub/Sub Channels

```typescript
// src/lib/redis/kanban-pubsub.ts
import redis from "@/lib/redis";

// Channel naming convention
export const KANBAN_CHANNEL = {
    project: (projectId: string) => `kanban:project:${projectId}`,
    workspace: (workspaceId: string) => `kanban:workspace:${workspaceId}`,
};

// Event types
export type KanbanEvent = {
    type: "CARD_MOVED" | "CARD_CREATED" | "CARD_DELETED" | "CARD_UPDATED";
    subTaskId: string;
    fromStatus?: string;
    toStatus?: string;
    movedBy: {
        id: string;
        name: string;
    };
    timestamp: number;
};

// Publish event
export async function publishKanbanEvent(
    projectId: string,
    event: KanbanEvent
) {
    await redis.publish(
        KANBAN_CHANNEL.project(projectId),
        JSON.stringify(event)
    );
}
```

#### Step 2: Update Status Move Action

Update `src/actions/task/kanban/update-subtask-status.ts`:

```typescript
// Add after line 285 (after invalidateProjectSubTasks)

import { publishKanbanEvent } from "@/lib/redis/kanban-pubsub";

// ... inside updateSubTaskStatus function, after invalidation:

// 14. Publish real-time update to Redis
await publishKanbanEvent(projectId, {
    type: "CARD_MOVED",
    subTaskId: subTaskId,
    fromStatus: subTask.status as string,
    toStatus: newStatus,
    movedBy: {
        id: user.id,
        name: user.name || "Unknown",
    },
    timestamp: Date.now(),
});
```

#### Step 3: Create SSE API Route

```typescript
// src/app/api/kanban/events/route.ts
import { NextRequest } from "next/server";
import redis from "@/lib/redis";
import { requireUser } from "@/lib/auth/require-user";
import { KANBAN_CHANNEL } from "@/lib/redis/kanban-pubsub";

export const runtime = "nodejs"; // Required for streaming
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const user = await requireUser();
    const projectId = request.nextUrl.searchParams.get("projectId");

    if (!projectId) {
        return new Response("Missing projectId", { status: 400 });
    }

    const encoder = new TextEncoder();
    const channel = KANBAN_CHANNEL.project(projectId);

    const stream = new ReadableStream({
        async start(controller) {
            // Subscribe to Redis channel
            const subscriber = redis.duplicate();
            
            await subscriber.subscribe(channel, (message) => {
                const data = `data: ${message}\n\n`;
                controller.enqueue(encoder.encode(data));
            });

            // Heartbeat every 30 seconds
            const heartbeat = setInterval(() => {
                controller.enqueue(encoder.encode(": heartbeat\n\n"));
            }, 30000);

            // Cleanup on disconnect
            request.signal.addEventListener("abort", () => {
                clearInterval(heartbeat);
                subscriber.unsubscribe(channel);
            });
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}
```

#### Step 4: Create Client Hook

```typescript
// src/hooks/use-kanban-events.ts
"use client";

import { useEffect, useCallback } from "react";

type KanbanEventHandler = (event: any) => void;

export function useKanbanEvents(
    projectId: string,
    onEvent: KanbanEventHandler
) {
    useEffect(() => {
        const eventSource = new EventSource(
            `/api/kanban/events?projectId=${projectId}`
        );

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                onEvent(data);
            } catch (e) {
                console.error("Failed to parse kanban event:", e);
            }
        };

        eventSource.onerror = (error) => {
            console.error("SSE error:", error);
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [projectId, onEvent]);
}
```

#### Step 5: Use in Kanban Component

```typescript
// In your KanbanBoard component
import { useKanbanEvents } from "@/hooks/use-kanban-events";

function KanbanBoard({ projectId, initialData }) {
    const [columns, setColumns] = useState(initialData);

    // Listen for real-time updates
    useKanbanEvents(projectId, useCallback((event) => {
        if (event.type === "CARD_MOVED") {
            // Update columns state
            setColumns((prev) => {
                // Move card from old column to new column
                // ... your logic here
                return updatedColumns;
            });
            
            toast.info(`${event.movedBy.name} moved a card to ${event.toStatus}`);
        }
    }, []));

    return (/* ... */);
}
```

---

## 🎯 Use Case 2: User Presence (Who's Viewing)

### Problem
Users can't see who else is viewing the same task or project.

### Solution: Redis Sorted Sets with TTL

```typescript
// src/lib/redis/presence.ts
import redis from "@/lib/redis";

const PRESENCE_TTL = 60; // 60 seconds

export type PresenceUser = {
    id: string;
    name: string;
    image?: string;
    lastSeen: number;
};

// Key patterns
const PRESENCE_KEY = {
    task: (taskId: string) => `presence:task:${taskId}`,
    project: (projectId: string) => `presence:project:${projectId}`,
};

/**
 * Register user presence on a task/project
 */
export async function registerPresence(
    entityType: "task" | "project",
    entityId: string,
    user: PresenceUser
) {
    const key = entityType === "task" 
        ? PRESENCE_KEY.task(entityId) 
        : PRESENCE_KEY.project(entityId);

    // Add user to sorted set with score = timestamp
    await redis.zadd(key, {
        score: Date.now(),
        member: JSON.stringify(user),
    });

    // Set TTL to auto-cleanup stale entries
    await redis.expire(key, PRESENCE_TTL * 2);
}

/**
 * Remove user presence
 */
export async function removePresence(
    entityType: "task" | "project",
    entityId: string,
    userId: string
) {
    const key = entityType === "task" 
        ? PRESENCE_KEY.task(entityId) 
        : PRESENCE_KEY.project(entityId);

    // Get all members and remove the matching user
    const members = await redis.zrange(key, 0, -1);
    for (const member of members) {
        const parsed = JSON.parse(member as string) as PresenceUser;
        if (parsed.id === userId) {
            await redis.zrem(key, member);
            break;
        }
    }
}

/**
 * Get active users for a task/project
 */
export async function getActiveUsers(
    entityType: "task" | "project",
    entityId: string
): Promise<PresenceUser[]> {
    const key = entityType === "task" 
        ? PRESENCE_KEY.task(entityId) 
        : PRESENCE_KEY.project(entityId);

    // Get users active in last 60 seconds
    const cutoff = Date.now() - (PRESENCE_TTL * 1000);
    const members = await redis.zrangebyscore(key, cutoff, "+inf");

    return members.map((m) => JSON.parse(m as string) as PresenceUser);
}

/**
 * Heartbeat to keep presence alive
 */
export async function heartbeat(
    entityType: "task" | "project",
    entityId: string,
    user: PresenceUser
) {
    return registerPresence(entityType, entityId, {
        ...user,
        lastSeen: Date.now(),
    });
}
```

### API Route for Presence

```typescript
// src/app/api/presence/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { 
    registerPresence, 
    removePresence, 
    getActiveUsers 
} from "@/lib/redis/presence";

// GET - List active users
export async function GET(request: NextRequest) {
    const entityType = request.nextUrl.searchParams.get("type") as "task" | "project";
    const entityId = request.nextUrl.searchParams.get("id");

    if (!entityType || !entityId) {
        return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const users = await getActiveUsers(entityType, entityId);
    return NextResponse.json({ users });
}

// POST - Register presence (heartbeat)
export async function POST(request: NextRequest) {
    const user = await requireUser();
    const { entityType, entityId } = await request.json();

    await registerPresence(entityType, entityId, {
        id: user.id,
        name: user.name || "Anonymous",
        image: user.image || undefined,
        lastSeen: Date.now(),
    });

    return NextResponse.json({ success: true });
}

// DELETE - Remove presence
export async function DELETE(request: NextRequest) {
    const user = await requireUser();
    const entityType = request.nextUrl.searchParams.get("type") as "task" | "project";
    const entityId = request.nextUrl.searchParams.get("id");

    if (!entityType || !entityId) {
        return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    await removePresence(entityType, entityId, user.id);
    return NextResponse.json({ success: true });
}
```

### Client Hook for Presence

```typescript
// src/hooks/use-presence.ts
"use client";

import { useEffect, useState, useCallback } from "react";

type PresenceUser = {
    id: string;
    name: string;
    image?: string;
    lastSeen: number;
};

export function usePresence(
    entityType: "task" | "project",
    entityId: string,
    currentUser: { id: string; name: string; image?: string }
) {
    const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);

    // Register presence on mount
    useEffect(() => {
        // Initial registration
        fetch("/api/presence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entityType, entityId }),
        });

        // Heartbeat every 30 seconds
        const heartbeatInterval = setInterval(() => {
            fetch("/api/presence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entityType, entityId }),
            });
        }, 30000);

        // Poll for active users every 10 seconds
        const pollInterval = setInterval(async () => {
            const res = await fetch(
                `/api/presence?type=${entityType}&id=${entityId}`
            );
            const data = await res.json();
            setActiveUsers(data.users.filter((u: PresenceUser) => u.id !== currentUser.id));
        }, 10000);

        // Remove presence on unmount
        return () => {
            clearInterval(heartbeatInterval);
            clearInterval(pollInterval);
            fetch(`/api/presence?type=${entityType}&id=${entityId}`, {
                method: "DELETE",
            });
        };
    }, [entityType, entityId, currentUser.id]);

    return { activeUsers };
}
```

---

## 🎯 Use Case 3: Distributed Rate Limiting

### Current State
You're using Arcjet for rate limiting. You can enhance it with Redis for distributed rate limiting.

```typescript
// src/lib/redis/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import redis from "@/lib/redis";

// Create rate limiters for different use cases
export const rateLimiters = {
    // API endpoints - 100 requests per minute
    api: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, "1 m"),
        prefix: "ratelimit:api",
    }),

    // Task creation - 20 per minute
    taskCreate: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, "1 m"),
        prefix: "ratelimit:task-create",
    }),

    // Kanban moves - 50 per minute
    kanbanMove: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(50, "1 m"),
        prefix: "ratelimit:kanban-move",
    }),

    // Auth attempts - 5 per minute
    auth: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "1 m"),
        prefix: "ratelimit:auth",
    }),
};

// Usage in API route or server action
export async function checkRateLimit(
    limiter: keyof typeof rateLimiters,
    identifier: string
) {
    const { success, limit, remaining, reset } = await rateLimiters[limiter].limit(identifier);

    if (!success) {
        return {
            allowed: false,
            error: `Rate limit exceeded. Try again in ${Math.ceil((reset - Date.now()) / 1000)} seconds.`,
            headers: {
                "X-RateLimit-Limit": limit.toString(),
                "X-RateLimit-Remaining": remaining.toString(),
                "X-RateLimit-Reset": reset.toString(),
            },
        };
    }

    return { allowed: true };
}
```

### Use in Server Action

```typescript
// In src/actions/task/kanban/update-subtask-status.ts
import { checkRateLimit } from "@/lib/redis/rate-limit";

export async function updateSubTaskStatus(...) {
    // Rate limit check
    const rateCheck = await checkRateLimit("kanbanMove", user.id);
    if (!rateCheck.allowed) {
        return { success: false, error: rateCheck.error };
    }
    
    // ... rest of the function
}
```

---

## 🎯 Use Case 4: Background Job Queue

### Problem
- Sending emails blocks the response
- Heavy operations slow down the UI

### Solution: BullMQ with Redis

```typescript
// src/lib/redis/queue.ts
import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";

// Redis connection for BullMQ
const connection = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
});

// Define job types
export type JobType = 
    | { type: "SEND_EMAIL"; data: { to: string; subject: string; html: string } }
    | { type: "TASK_NOTIFICATION"; data: { userId: string; taskId: string; action: string } }
    | { type: "AUDIT_CLEANUP"; data: { olderThan: Date } };

// Create queues
export const queues = {
    email: new Queue<JobType>("email-queue", { connection }),
    notifications: new Queue<JobType>("notification-queue", { connection }),
    maintenance: new Queue<JobType>("maintenance-queue", { connection }),
};

// Add job to queue
export async function enqueue(
    queue: keyof typeof queues,
    job: JobType,
    options?: { delay?: number; priority?: number }
) {
    return queues[queue].add(job.type, job, {
        delay: options?.delay,
        priority: options?.priority,
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 1000,
        },
    });
}
```

### Email Worker

```typescript
// src/workers/email-worker.ts
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { sendEmail } from "@/lib/email";

const connection = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
});

const emailWorker = new Worker(
    "email-queue",
    async (job) => {
        if (job.data.type === "SEND_EMAIL") {
            const { to, subject, html } = job.data.data;
            await sendEmail({ to, subject, html });
        }
    },
    { connection }
);

emailWorker.on("completed", (job) => {
    console.log(`Email job ${job.id} completed`);
});

emailWorker.on("failed", (job, err) => {
    console.error(`Email job ${job?.id} failed:`, err);
});
```

### Use in Server Action

```typescript
// Instead of sending email directly:
import { enqueue } from "@/lib/redis/queue";

// In createTask action:
await enqueue("email", {
    type: "SEND_EMAIL",
    data: {
        to: assignee.email,
        subject: `New Task Assigned: ${taskName}`,
        html: emailTemplate,
    },
});
// Response returns immediately, email sent in background
```

---

## 🎯 Use Case 5: Distributed Locks

### Problem
Concurrent edits can cause race conditions (e.g., two users editing same task).

### Solution: Redis Locks with Redlock

```typescript
// src/lib/redis/lock.ts
import redis from "@/lib/redis";

const LOCK_TTL = 10000; // 10 seconds

/**
 * Acquire a distributed lock
 */
export async function acquireLock(
    resource: string,
    ttl: number = LOCK_TTL
): Promise<string | null> {
    const lockKey = `lock:${resource}`;
    const lockValue = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // SET NX (only if not exists) with expiry
    const acquired = await redis.set(lockKey, lockValue, {
        nx: true,
        px: ttl,
    });

    return acquired ? lockValue : null;
}

/**
 * Release a distributed lock
 */
export async function releaseLock(
    resource: string,
    lockValue: string
): Promise<boolean> {
    const lockKey = `lock:${resource}`;

    // Only delete if we own the lock
    const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
    `;

    const result = await redis.eval(script, [lockKey], [lockValue]);
    return result === 1;
}

/**
 * Execute function with lock
 */
export async function withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    ttl: number = LOCK_TTL
): Promise<{ success: boolean; result?: T; error?: string }> {
    const lockValue = await acquireLock(resource, ttl);

    if (!lockValue) {
        return {
            success: false,
            error: "Resource is currently locked. Please try again.",
        };
    }

    try {
        const result = await fn();
        return { success: true, result };
    } finally {
        await releaseLock(resource, lockValue);
    }
}
```

### Use in Server Action

```typescript
// In editSubTask action:
import { withLock } from "@/lib/redis/lock";

export async function editSubTask(data, subTaskId) {
    const result = await withLock(
        `task:${subTaskId}`,
        async () => {
            // ... your edit logic here
            return { status: "success", message: "Updated" };
        }
    );

    if (!result.success) {
        return { status: "error", message: result.error };
    }

    return result.result;
}
```

---

## 🎯 Use Case 6: Session Caching

### Problem
Every request hits the database to validate sessions.

### Solution: Cache sessions in Redis

```typescript
// src/lib/redis/session-cache.ts
import redis from "@/lib/redis";

const SESSION_TTL = 3600; // 1 hour

type SessionData = {
    userId: string;
    email: string;
    name: string;
    image?: string;
    expiresAt: Date;
};

/**
 * Cache session after database fetch
 */
export async function cacheSession(
    sessionToken: string,
    session: SessionData
) {
    await redis.set(
        `session:${sessionToken}`,
        JSON.stringify(session),
        { ex: SESSION_TTL }
    );
}

/**
 * Get cached session
 */
export async function getCachedSession(
    sessionToken: string
): Promise<SessionData | null> {
    const cached = await redis.get(`session:${sessionToken}`);
    if (!cached) return null;
    
    return JSON.parse(cached as string) as SessionData;
}

/**
 * Invalidate session cache
 */
export async function invalidateSessionCache(sessionToken: string) {
    await redis.del(`session:${sessionToken}`);
}
```

---

## 📊 Redis Data Structure Reference

| Use Case | Redis Data Structure | Key Pattern |
|----------|---------------------|-------------|
| Presence | Sorted Set | `presence:task:{id}` |
| Rate Limiting | String + Counter | `ratelimit:{type}:{id}` |
| Pub/Sub | Channels | `kanban:project:{id}` |
| Locks | String (with NX) | `lock:{resource}` |
| Sessions | String (JSON) | `session:{token}` |
| Queues | Lists/Streams | `queue:{name}` |
| Counters | String (INCR) | `counter:{entity}:{id}` |

---

## 🚀 Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 🔴 High | Real-time Kanban | Medium | High |
| 🔴 High | Session Caching | Low | High |
| 🟡 Medium | User Presence | Medium | Medium |
| 🟡 Medium | Distributed Locks | Low | Medium |
| 🟢 Low | Background Queues | High | Medium |
| 🟢 Low | Rate Limiting | Low | Low |

---

## 🔧 Recommended Setup

### For Development
Use Docker for local Redis:
```bash
docker run -d --name tusker-redis -p 6379:6379 redis:alpine
```

### For Production
Use **Upstash Redis** for:
- Serverless-friendly (HTTP-based)
- Global edge caching
- Built-in REST API
- Free tier available

```env
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

---

## 📁 Suggested File Structure

```
src/
├── lib/
│   ├── redis.ts              # Redis client singleton
│   └── redis/
│       ├── presence.ts       # User presence functions
│       ├── kanban-pubsub.ts  # Real-time Kanban events
│       ├── rate-limit.ts     # Rate limiting
│       ├── lock.ts           # Distributed locks
│       ├── queue.ts          # Job queues
│       └── session-cache.ts  # Session caching
├── hooks/
│   ├── use-kanban-events.ts  # Client-side Kanban events
│   └── use-presence.ts       # Client-side presence
├── app/
│   └── api/
│       ├── kanban/
│       │   └── events/
│       │       └── route.ts  # SSE for Kanban
│       └── presence/
│           └── route.ts      # Presence API
└── workers/
    └── email-worker.ts       # Background workers
```

---

## 🎯 Quick Start Checklist

- [ ] Sign up for [Upstash](https://upstash.com) (free tier)
- [ ] Add environment variables
- [ ] Install packages: `pnpm add @upstash/redis @upstash/ratelimit`
- [ ] Create `src/lib/redis.ts`
- [ ] Implement session caching (easiest first win)
- [ ] Add real-time Kanban events
- [ ] Add user presence

---

*Document created: December 29, 2025*
*For: Tusker Management Project*
