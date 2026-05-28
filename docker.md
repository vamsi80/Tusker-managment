# 🐳 Tusker Management Platform: Docker Guide
> A complete, beginner-friendly guide to understanding and managing your containerized Next.js and Supabase environment.

---

## 🍽️ The Real-World Analogy: Chef, Recipe, and Kitchen

Imagine you franchise a top-tier restaurant named **Tusker Management**. You have an exceptional **Head Chef** (your Next.js code) and a highly specific **Recipe** (your package dependencies and database models).

```
   Traditional Setup [Disaster]             Dockerized Setup [Perfection]
┌─────────────────────────────────┐      ┌─────────────────────────────────┐
│  NY Kitchen (Gas Stove, local)  │      │ ┌─────────────────────────────┐ │
│         vs.                     │  ───>│ │   Self-Contained Pod        │ │
│  London Kitchen (Electric, pool)│      │ │   (Same stove, blender, DB) │ │
│  "Works in NY, fails in London!"│      │ └─────────────────────────────┘ │
└─────────────────────────────────┘      └─────────────────────────────────┘
```

* **Without Docker (The Chaos):**
  If you open one kitchen in New York (your Windows dev PC) and one in London (the Cloud production server), minor differences (gas vs. electric stove, different blender speeds, local water supply) cause your signature dish to taste completely different or burn. In software, this is: *"It works perfectly on my machine, why does it crash on the server?"*
* **With Docker (The Magic):**
  You package a pre-fabricated, self-contained **Kitchen Pod** (a Docker Container). It comes with the exact same stove, blender, and utensils. Whether dropped in New York, London, or a cruise ship, **the dish tastes identical everywhere**.

---

## 📊 Understanding Image Sizes

When you run `docker image ls` (or list images in your terminal), you will notice two size values:

| Metric | Size | What it Represents |
| :--- | :--- | :--- |
| **DISK USAGE** | **~2.15 GB** | The **scaffolding & raw materials** cached on your local computer. This includes compiler utilities, TypeScript checkers, and package managers (`pnpm`). Docker keeps this to make future builds run in seconds. |
| **CONTENT SIZE** | **~440 MB** | The **final dish shipped to production**. It contains only the compiled code, core production packages, and the lightweight Next.js runner. |

---

## 📂 Visual Path Concept: Why `WORKDIR` is `/app` and not `/src`

Your Next.js project has a root folder containing configuration files (`package.json`, `next.config.ts`, `prisma/`) and a `src` subfolder containing raw source code.

### 🌟 If `WORKDIR /app` (Correct)
Docker treats `/app` as your whole project root folder. Your folder structure inside Linux matches your Windows layout perfectly:
```text
/app (Root Workspace)
├── package.json
├── pnpm-lock.yaml
├── next.config.ts
├── prisma/
│   └── schema.prisma
└── src/                      <-- Clean source code folder inside root!
    ├── app/
    └── lib/
```

### ❌ If `WORKDIR /src` (Broken)
If the project root is called `/src`, copying your source files results in a confusing double-folder structure inside the container:
```text
/src (Root Workspace)
├── package.json
├── pnpm-lock.yaml
├── next.config.ts
└── src/                      <-- Creates a folder named "/src/src"!
    ├── app/
    └── lib/
```
This breaks TypeScript imports, path mappings, and database client resolution.

---

## 👮 1. Pin-to-Pin Guide: `.dockerignore`

This file acts as a gatekeeper, telling Docker **what NOT to copy** from your computer into the container during construction.

```text
node_modules         # Prevents copying your Windows-compiled packages into the Linux container
.next                # Ignores your local build files (we want a fresh, clean build inside Docker)
out                  # Ignores any static exports
build                # Ignores custom build outputs
.git                 # Prevents copying git history files (reduces image size)
.gitignore           # Ignores Git configs
.env                 # CRITICAL: Prevents copying your private credentials into the static image!
.env*.local          # Ignores local secret files
*.log*               # Ignores debug logs
README.md            # Ignores documentation
Dockerfile           # Ignores the Docker configuration files themselves
docker-compose.yml
.dockerignore
```

---

## 🍳 2. Pin-to-Pin Guide: `Dockerfile`

The `Dockerfile` is divided into three separate steps (**Stages**) to create an ultra-secure, optimized production image.

```dockerfile
# ==========================================
# STAGE 1: Install Dependencies (deps)
# ==========================================
FROM node:20-alpine AS deps
# 1. Start from an ultra-lightweight Linux image containing Node 20.

RUN apk add --no-cache libc6-compat
# 2. Install libc6-compat (helps native Node libraries run smoothly on Alpine Linux).

WORKDIR /app
# 3. Create a clean project root directory inside Linux.

RUN npm install -g pnpm@10.18.1
# 4. Install the exact same package manager (pnpm) version used locally.

COPY package.json pnpm-lock.yaml* ./
# 5. Copy ONLY your dependency lists (allows Docker to cache dependencies).

RUN pnpm install --ignore-scripts
# 6. Install all packages while ignoring post-install scripts (prevents early compile checks).


# ==========================================
# STAGE 2: Build the Application (builder)
# ==========================================
FROM node:20-alpine AS builder
# 7. Start a fresh temporary room for compiling your application.

WORKDIR /app
# 8. Re-establish the clean root directory.

RUN npm install -g pnpm@10.18.1
# 9. Re-install pnpm inside this compilation room.

COPY --from=deps /app/node_modules ./node_modules
# 10. Copy all the cached dependencies we downloaded in Stage 1.

COPY . .
# 11. Copy your actual code (pages, styles, components, etc.) into the builder.

ENV NEXT_TELEMETRY_DISABLED=1
# 12. Turn off Next.js telemetry logs to speed up builds.

ENV SKIP_ENV_VALIDATION=1
# 13. IMPORTANT: Prevents compile-time crashes by letting Next.js skip strict Zod checking.

ENV BETTER_AUTH_SECRET="dummy_secret_must_be_32_characters_long_12345"
ENV BETTER_AUTH_URL="http://localhost:3000"
# 14. Placeholders to let Better-Auth routes compile successfully during static generation.

RUN pnpm prisma generate
# 15. Generate your local Prisma Client database schemas.

RUN pnpm build
# 16. Compile your code into highly optimized Next.js static and dynamic web assets.


# ==========================================
# STAGE 3: Production Runner (runner)
# ==========================================
FROM node:20-alpine AS runner
# 17. The final, ultra-clean image! Everything before this is thrown away.

WORKDIR /app
# 18. Set the final root directory.

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# 19. Configure runtime production flags. Hostname "0.0.0.0" allows external browser access.

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
# 20. SECURITY: Create a custom user so your app doesn't run with root/administrator access.

COPY --from=builder /app/public ./public
# 21. Copy static images and public assets.

COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/src/generated/prisma ./src/generated/prisma
# 22. Copy only the compiled output folders, assigning ownership to our safe "nextjs" user.

USER nextjs
# 23. Switch to the secure non-root user.

EXPOSE 3000
# 24. Open port 3000 for web traffic.

CMD ["npx", "next", "start"]
# 25. Start the production Next.js server!
```

---

## 🎼 3. Pin-to-Pin Guide: `docker-compose.yml`

This file coordinates the container's operational rules, port mappings, and environment variables.

```yaml
services:
  # Tusker Next.js Application
  app:
    build:
      context: .
      dockerfile: Dockerfile
    # 1. Tells compose to build the image using the local Dockerfile in this folder.

    container_name: tusker-app
    # 2. Names the container "tusker-app" inside Docker Desktop.

    restart: always
    # 3. Automatically boots up the app if your computer restarts or the app crashes.

    ports:
      - "3000:3000"
    # 4. Forwards port 3000 on your PC to port 3000 inside the container.

    env_file:
      - .env
    # 5. AMAZING: Automatically imports all keys from your local .env file (Supabase, SMTP, Auth)
    #    and injects them at container startup. No secret hardcoding required!

    environment:
      - NODE_ENV=production
    # 6. Sets Next.js to start in high-performance production mode.

    command: ["npx", "next", "start"]
    # 7. Launches your production server.
```

---

## 🛠️ Docker Cheatsheet: Commands You Need to Know

Keep these commands handy in your terminal:

* **Build & Start everything (Background mode)**:
  ```powershell
  docker compose up --build -d
  ```
* **View running logs (Very helpful for debugging)**:
  ```powershell
  docker compose logs -f
  ```
* **Stop the running application**:
  ```powershell
  docker compose down
  ```
* **Check if your container is running**:
  ```powershell
  docker compose ps
  ```
* **Completely purge unused cache (Free up disk space)**:
  ```powershell
  docker system prune -a --volumes
  ```
