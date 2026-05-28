# 🏥 React Doctor Fix Plan — Tusker Management
> Current Score: **42 / 100** | Total Issues: **2143** | Errors: **29** | Warnings: **2114**

---

## 🔴 TIER 1 — Errors (Fix First, Mandatory)
> These are **correctness and accessibility bugs**. They affect real users and screen readers.
> **Estimated effort: 1–2 hours**

### Issue 1: `rules-of-hooks` — Hook inside try/catch block ⚡ 
Calling a React Hook inside a `try/catch` breaks React's rules and can cause silent rendering bugs.

| File | Line |
|:---|:---|
| `src/components/task/shared/subtask-status-changer.tsx` | 50 |

**Fix:** Move `useTaskTableContext()` to the top of the component function, before the try block. Pass the result as a variable into the try block instead.

---

### Issue 2: `role-has-required-aria-props` — Missing `aria-controls` on combobox ×3 ♿
Components using `role="combobox"` are missing the required `aria-controls` attribute. Screen readers cannot navigate these inputs.

| File | Line |
|:---|:---|
| `src/app/w/[workspaceId]/reports/_components/DailyReportModal.tsx` | 115 |
| `src/app/w/[workspaceId]/vendors/[vendorId]/_components/vendor-capabilities.tsx` | 269 |
| `src/components/ui/multi-select-tags.tsx` | 56 |

**Fix:** Add `aria-controls="<list-id>"` to each combobox element, pointing to the ID of the dropdown list it controls.

---

### Issue 3: `no-single-child-fragment` — Useless `<>` wrappers ×26 🗑️
Empty fragment wrappers around a single child element add zero value and slow down reconciliation.

| Files (sample) |
|:---|
| `src/components/task/list/task-row.tsx` |
| `src/components/task/kanban/kanban-skeleton.tsx` |

**Fix:** Remove the `<>...</>` wrappers where there is only one child element inside.

---

### Issue 4: `multi-comp` — Multiple components in one file ×10 🏗️
Each file should export exactly one React component. This makes debugging, testing, and code splitting much easier.

| Files (sample) |
|:---|
| `src/components/task/list/task-row.tsx` |
| `src/app/w/[workspaceId]/p/page.tsx` |
| `src/components/task/kanban/kanban-skeleton.tsx` |

**Fix:** Extract the extra components into their own files. E.g., if `task-row.tsx` also exports `TaskTableSkeleton`, move that skeleton into a new `task-row-skeleton.tsx` file.

---

## 🟡 TIER 2 — High-Impact Warnings (Fix Next, Recommended)
> These are **performance and UX anti-patterns**. They make your app slower or harder to maintain.
> **Estimated effort: 3–5 hours**

### Issue 5: `design-no-redundant-size-axes` — `w-N h-N` → `size-N` ×654 🎨
The most common issue. Tailwind v4 has a shorthand `size-8` that replaces `w-8 h-8`. This has no functional impact but makes CSS cleaner and faster to read.

**Fix (All at once using Find & Replace):**
In VS Code, press `Ctrl+Shift+H` (Find & Replace across files) and replace patterns like:
- `w-4 h-4` → `size-4`
- `w-5 h-5` → `size-5`
- `w-6 h-6` → `size-6`
- `w-8 h-8` → `size-8`
- `w-10 h-10` → `size-10`

> ⚡ **This one fix will resolve 654 of your 2143 issues instantly.**

---

### Issue 6: `exhaustive-deps` — Missing `useEffect` dependencies ×57 🔄
A `useEffect` is running with variables that can change, but those variables are not listed in the dependency array. This causes stale data bugs (effects don't re-run when they should).

| Files (sample) |
|:---|
| `src/app/w/[workspaceId]/p/[slug]/gantt/page.tsx` |
| `src/components/task/list/use-task-table-logic.ts` |

**Fix:** Add the missing variable to the `useEffect` dependency array. VS Code or ESLint will show you exactly which variable is missing.

---

### Issue 7: `no-unnecessary-type-assertion` — Useless `as` casts ×40 🔧
TypeScript already knows the type, but you are using `as SomeType` to force cast anyway. This is extra noise and can mask real bugs.

| Files (sample) |
|:---|
| `src/server/services/task/tasks.service.ts` |
| `src/lib/errors/app-error.ts` |

**Fix:** Remove the unnecessary `as` casts where TypeScript already infers the type correctly.

---

### Issue 8: `nextjs-no-img-element` — Using `<img>` instead of Next.js `<Image>` 🖼️
Plain `<img>` tags don't get automatic WebP optimization, lazy loading, or responsive sizing. This makes your app load images slower.

| File | Line |
|:---|:---|
| `src/app/w/[workspaceId]/reports/_components/report-table.tsx` | 386 |

**Fix:** Replace `<img src="..." />` with `import Image from 'next/image'` and use `<Image src="..." width={} height={} alt="..." />`.

---

### Issue 9: `no-prop-callback-in-effect` — Anti-pattern: calling prop callback inside `useEffect` ×2 📡
Calling an `onLoadMore` prop inside a `useEffect` creates a hidden sync dependency. This is an anti-pattern that leads to infinite loops and stale renders.

| File | Line |
|:---|:---|
| `src/app/w/.../subtaskSheet/activity-tab.tsx` | 47 |
| `src/components/task/kanban/kanban-column.tsx` | 91 |

**Fix:** Call the callback directly in an event handler (`onClick`, `onScroll`) instead of inside a `useEffect`.

---

### Issue 10: `no-render-in-render` — Inline render function ×1 ⚙️
Defining a function `renderContent()` inside a component and calling it during render causes React to skip reconciliation and re-create DOM nodes on every render.

| File | Line |
|:---|:---|
| `src/components/file-uploader/uploader.tsx` | 284 |

**Fix:** Extract `renderContent()` into a proper named React component above the parent component.

---

### Issue 11: `unused-dependency` — Unused npm packages ×4 📦
These packages are installed in `package.json` but never imported in your code. They bloat your Docker image size unnecessarily.

| Package | Type |
|:---|:---|
| `@tanstack/react-virtual` | dependency |
| `@better-auth/cli` | devDependency |

**Fix:** Run `pnpm remove @tanstack/react-virtual` and `pnpm remove -D @better-auth/cli`.

---

## 🟢 TIER 3 — Style & Polish (Nice to Have)
> These are minor design and code quality improvements.

| Rule | Count | Quick Fix |
|:---|:---|:---|
| `design-no-redundant-padding-axes` — `px-2 py-2` → `p-2` | ×2 | Use `p-2` shorthand |
| `js-tosorted-immutable` — `[...arr].sort()` → `arr.toSorted()` | ×2 | ES2023 immutable sort |
| `no-inline-bounce-easing` — `animate-bounce` is dated | ×2 | Use `ease-out-expo` transitions |
| `design-no-vague-button-label` — Button labeled "Done" | ×2 | Rename to "Save changes" |
| `no-gradient-text` — AI-tell gradient text | ×1 | Use solid text color |
| `no-gray-on-colored-background` — Gray text on red bg | ×1 | Use white or red-800 text |
| `no-autofocus` — `autoFocus` on input | ×1 | Remove `autoFocus` prop |
| `no-long-transition-duration` — 1200ms transition | ×1 | Keep transitions under 500ms |
| `media-has-caption` — `<video>` missing captions | ×1 | Add `<track kind="captions">` |

---

## 🗺️ Recommended Fix Order

```
Week 1 (Now): Fix all Tier 1 Errors (29 issues → score jumps ~+15)
  └── rules-of-hooks (1 file)
  └── aria-combobox (3 files)
  └── single-child-fragments (26 files, easy find & replace)

Week 1 (Quick Win): Fix size-N shorthand (654 issues → score jumps ~+20)
  └── Ctrl+Shift+H mass replace in VS Code

Week 2: Fix exhaustive-deps & type-assertion warnings
Week 3: Remove unused dependencies + img → next/image
Week 4: Polish (gradients, transitions, button labels)
```

---

## 📈 Projected Score After Each Tier

| After Tier | Issues Fixed | Estimated Score |
|:---|:---|:---|
| Current | — | **42 / 100** |
| After Tier 1 (Errors) | 29 | ~**57 / 100** |
| After `size-N` mass fix | +654 | ~**72 / 100** |
| After Tier 2 fully | +100 | ~**85 / 100** |
| After Tier 3 | +15 | ~**90 / 100** |
